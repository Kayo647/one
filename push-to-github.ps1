# push-to-github.ps1 -- push this repo to https://github.com/Kayo647/one
#
# Why this script exists (two traps on this machine):
#   1. The GLOBAL git config points at a dead proxy:
#        git config --global http.proxy  = http://127.0.0.1:7897
#        git config --global https.proxy = http://127.0.0.1:7897
#      Nothing listens on port 7897 (the proxy app is not running), so every
#      git network operation fails. This script disables the proxy for its own
#      git calls only (`git -c http.proxy=`), and does NOT touch your global config.
#   2. The first push needs credentials. Use a Personal Access Token (PAT) in the
#      credential popup. Never paste the token into this file or commit it.
#
# Usage (run in the project root):
#   powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1
#
# ASCII only on purpose: Windows PowerShell 5.1 reads .ps1 files as ANSI unless
# they carry a UTF-8 BOM, which would corrupt non-ASCII text in this file.

$ErrorActionPreference = 'Stop'
$repoUrl = 'https://github.com/Kayo647/one.git'

function Invoke-GitNoProxy {
    # forward all args to git with proxy disabled for this invocation only
    & git -c http.proxy= -c https.proxy= @args
    return $LASTEXITCODE
}

Write-Host "=== 1/5 checking local repo ===" -ForegroundColor Cyan
if (-not (Test-Path .git)) { throw "Not a git repository. Run this from the project root." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git not found. Install Git for Windows first." }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host ("  branch : " + $branch)
Write-Host ("  head   : " + (git log -1 --format='%h %s'))
Write-Host ("  author : " + (git log -1 --format='%an <%ae>'))
if (git status --porcelain) { Write-Host "  note: working tree has uncommitted changes (they are not pushed)" -ForegroundColor Yellow }

Write-Host "=== 2/5 setting remote ===" -ForegroundColor Cyan
$existing = (git remote get-url origin 2>$null)
if ($existing) {
    if ($existing.Trim() -ne $repoUrl) {
        Write-Host ("  origin was " + $existing + ", updating to " + $repoUrl)
        git remote set-url origin $repoUrl
    } else {
        Write-Host ("  origin already " + $repoUrl)
    }
} else {
    git remote add origin $repoUrl
    Write-Host ("  added origin -> " + $repoUrl)
}

Write-Host "=== 3/5 clearing proxy env vars for this session ===" -ForegroundColor Cyan
foreach ($n in 'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy') {
    if (Test-Path ("Env:" + $n)) { Remove-Item ("Env:" + $n); Write-Host ("  cleared " + $n) }
}

Write-Host "=== 4/5 connectivity probe (proxy off) ===" -ForegroundColor Cyan
$probe = git -c http.proxy= -c https.proxy= ls-remote --heads origin 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  cannot reach GitHub." -ForegroundColor Red
    ($probe | Select-String 'fatal' | Select-Object -First 1) | ForEach-Object { Write-Host ("  " + $_.Line) }
    Write-Host "  Check your network, or start the proxy app and retry." -ForegroundColor Yellow
    Write-Host "  If your proxy works, point git at it instead:" -ForegroundColor Yellow
    Write-Host "    git config --global http.proxy http://127.0.0.1:7897" -ForegroundColor Yellow
    exit 1
}
Write-Host "  reachable" -ForegroundColor Green
if ($probe) {
    Write-Host "  remote already has branches:" -ForegroundColor Yellow
    $probe | Select-Object -First 5 | ForEach-Object { Write-Host ("    " + $_) }
} else {
    Write-Host "  remote is empty (fresh repository) -- fine for a first push"
}

Write-Host "=== 5/5 pushing ===" -ForegroundColor Cyan
Write-Host "  If a credential window appears: user = Kayo647, password = your Personal Access Token" -ForegroundColor Yellow
Write-Host "  (a PAT with 'repo' scope; GitHub no longer accepts account passwords for push)" -ForegroundColor Yellow
git -c http.proxy= -c https.proxy= -c credential.https://github.com.provider=manager push -u origin $branch

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Push succeeded: https://github.com/Kayo647/one" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Push failed. Common causes:" -ForegroundColor Red
    Write-Host "  - invalid or expired credential: create a new PAT"
    Write-Host "    (Settings -> Developer settings -> Personal access tokens)"
    Write-Host "  - remote already has unrelated commits. If you are sure this is your own"
    Write-Host "    new repo and you want to overwrite it, re-run the push with --force:"
    Write-Host ("      git push -u origin " + $branch + " --force")
}
