# push-to-github.ps1 -- push this repo to https://github.com/Kayo647/one
#
# Background (measured on this machine):
#   * The GLOBAL git config points at a proxy: http://127.0.0.1:7897
#     Direct connections to github.com time out here, but the proxy works
#     (verified: ls-remote through it returns the remote SHA in ~2s).
#     So this script uses the proxy FIRST and falls back to no proxy.
#   * The first push needs credentials. Use a Personal Access Token (PAT):
#     user = Kayo647, password = the token. GitHub rejects account passwords.
#
# Everything is written to git-push.log in this folder, so you can read the
# result even if the window closes.
#
# ASCII only on purpose: Windows PowerShell 5.1 decodes .ps1 as ANSI unless the
# file has a UTF-8 BOM, which would corrupt non-ASCII text.

param(
    [switch]$NoPause,
    [switch]$Force
)

$ErrorActionPreference = 'Continue'
$repoUrl  = 'https://github.com/Kayo647/one.git'
$proxyUrl = 'http://127.0.0.1:7897'
$logPath  = Join-Path (Get-Location) 'git-push.log'
$branch   = 'main'

function Log {
    param([string]$Text, [string]$Color = 'Gray')
    Write-Host $Text -ForegroundColor $Color
    Add-Content -Path $logPath -Value $Text -Encoding UTF8
}

# fresh log for this run
Set-Content -Path $logPath -Value ("=== push run " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + " ===") -Encoding UTF8

try {
    Log "=== 1/6 repository check ===" Cyan
    if (-not (Test-Path .git)) { throw "Not a git repository. Run this from the project root." }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git not found. Install Git for Windows first." }
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    Log ("  branch : " + $branch)
    Log ("  head   : " + (git log -1 --format='%h %s'))
    Log ("  author : " + (git log -1 --format='%an <%ae>'))
    if (git status --porcelain) { Log "  note: uncommitted changes exist (they will NOT be pushed)" Yellow }

    Log "=== 2/6 remote ===" Cyan
    $existing = (git remote get-url origin 2>$null)
    if (-not $existing) { git remote add origin $repoUrl; Log ("  added origin -> " + $repoUrl) }
    elseif ($existing.Trim() -ne $repoUrl) { git remote set-url origin $repoUrl; Log ("  origin set to " + $repoUrl) }
    else { Log ("  origin already " + $repoUrl) }

    Log "=== 3/6 connectivity (proxy first, then direct) ===" Cyan
    $useProxy = $true
    $probe = git -c http.proxy=$proxyUrl -c https.proxy=$proxyUrl ls-remote --heads origin 2>&1
    if ($LASTEXITCODE -ne 0) {
        Log "  via proxy failed:" Yellow
        ($probe | Select-String 'fatal|error' | Select-Object -First 2) | ForEach-Object { Log ("    " + $_.Line.Trim()) }
        Log "  trying without proxy..." Yellow
        $useProxy = $false
        $probe = git -c http.proxy= -c https.proxy= ls-remote --heads origin 2>&1
        if ($LASTEXITCODE -ne 0) {
            Log "  both routes failed:" Red
            $probe | Select-Object -First 5 | ForEach-Object { Log ("    " + $_) }
            throw "Cannot reach GitHub. Start the proxy app on 127.0.0.1:7897 and retry."
        }
    }
    Log ("  reachable (" + $(if ($useProxy) { 'via proxy 127.0.0.1:7897' } else { 'direct' }) + ")") Green
    $remoteSha = ''
    if ($probe) { $remoteSha = (($probe | Select-Object -First 1) -split '\s+')[0] }
    Log ("  remote refs/heads/" + $branch + " = " + $(if ($remoteSha) { $remoteSha } else { '(empty)' }))

    Log "=== 4/6 proxy flags for the push ===" Cyan
    if ($useProxy) { $px = @('-c', "http.proxy=$proxyUrl", '-c', "https.proxy=$proxyUrl") }
    else           { $px = @('-c', 'http.proxy=', '-c', 'https.proxy=') }
    Log ("  git " + ($px -join ' '))

    Log "=== 5/6 push ===" Cyan
    Log "  A credential window may appear. Enter:" Yellow
    Log "    username = Kayo647"
    Log "    password = your Personal Access Token (needs 'repo' scope)"
    Log "  (GitHub no longer accepts your account password for push)" Yellow

    $pushArgs = @() + $px + @('-c', 'credential.https://github.com.provider=manager')
    if ($remoteSha) {
        Log ("  remote has an unrelated history -> using --force-with-lease pinned to " + $remoteSha) Yellow
        $pushArgs += @('push', '-u', 'origin', $branch, ("--force-with-lease=refs/heads/" + $branch + ":" + $remoteSha))
    } else {
        $pushArgs += @('push', '-u', 'origin', $branch)
    }
    if ($Force) { $pushArgs += '--force'; Log "  -Force given: plain --force appended" Yellow }

    Log ("  running: git " + ($pushArgs -join ' '))
    $pushOut = & git @pushArgs 2>&1
    $code = $LASTEXITCODE
    $pushOut | ForEach-Object { Log ("    " + $_) }

    Log "=== 6/6 result ===" Cyan
    if ($code -eq 0) {
        Log "PUSH SUCCEEDED -> https://github.com/Kayo647/one" Green
        Log "Open the URL above; the README should render on the repository page." Green
    } else {
        Log ("PUSH FAILED (git exit " + $code + ")") Red
        Log "" 
        Log "What to do next:" Yellow
        Log "  [a] Credential rejected / cancelled:"
        Log "      create a token at GitHub -> Settings -> Developer settings"
        Log "      -> Personal access tokens. Scope 'repo' (fine-grained: Contents = Read and write)."
        Log "      then clear any cached bad credential and retry:"
        Log "        cmdkey /list | findstr github"
        Log "        cmdkey /delete:git:https://github.com"
        Log "  [b] Non-fast-forward:"
        Log "      retry once (remote SHA is re-read each run), or force:"
        Log ("        git -c http.proxy=" + $proxyUrl + " -c https.proxy=" + $proxyUrl + " push -u origin " + $branch + " --force")
        Log "  [c] Send me the whole git-push.log (it contains this same text)."
    }
} catch {
    Log ("ERROR: " + $_.Exception.Message) Red
    Log "See git-push.log for the full transcript." Yellow
} finally {
    Log ""
    Log ("Log file: " + $logPath)
    if (-not $NoPause) {
        Write-Host ""
        Read-Host "Press Enter to close"
    }
}
