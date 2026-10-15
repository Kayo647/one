# push-to-github.ps1 —— 把本仓库推送到 https://github.com/Kayo647/one
#
# 为什么要用这个脚本（两个坑）：
#   1. 本机的全局 git 配置指向一个失效代理：
#        git config --global http.proxy  = http://127.0.0.1:7897
#        git config --global https.proxy = http://127.0.0.1:7897
#      而 7897 端口没有进程监听（代理软件未运行），会让所有 git 网络操作失败。
#      脚本用 `git -c http.proxy=` 仅为本次命令关闭代理，**不改动你的全局配置**。
#   2. 首次推送需要 GitHub 凭据。推荐用 Personal Access Token（PAT），
#      在弹窗里输入即可；不要写进本文件或提交到仓库。
#
# 用法：在本目录打开 PowerShell，执行
#        powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1

$ErrorActionPreference = 'Stop'

$repoUrl = 'https://github.com/Kayo647/one.git'

Write-Host "=== 1/5 检查本地仓库 ===" -ForegroundColor Cyan
if (-not (Test-Path .git)) { throw "当前目录不是 git 仓库，请在项目根目录运行。" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "未找到 git，请先安装 Git for Windows。" }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$author = (git log -1 --format='%an <%ae>').Trim()
Write-Host "  分支     : $branch"
Write-Host "  最新提交 : $(git log -1 --format='%h %s')"
Write-Host "  作者     : $author"
$dirty = git status --porcelain
if ($dirty) { Write-Host "  注意：工作树有未提交改动（不影响推送已提交内容）" -ForegroundColor Yellow }

Write-Host "=== 2/5 设置远端 ===" -ForegroundColor Cyan
$existing = git remote get-url origin 2>$null
if ($existing) {
  if ($existing.Trim() -ne $repoUrl) {
    Write-Host "  远端 origin 原为 $existing，改为 $repoUrl"
    git remote set-url origin $repoUrl
  } else { Write-Host "  远端 origin 已是 $repoUrl" }
} else {
  git remote add origin $repoUrl
  Write-Host "  已添加远端 origin -> $repoUrl"
}

Write-Host "=== 3/5 清除本次会话的代理环境变量 ===" -ForegroundColor Cyan
foreach ($n in 'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy') {
  if (Test-Path "Env:$n") { Remove-Item "Env:$n"; Write-Host "  已清除 $n" }
}

Write-Host "=== 4/5 连通性探测（关闭代理）===" -ForegroundColor Cyan
git -c http.proxy= -c https.proxy= ls-remote --heads origin 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "  无法访问 GitHub。请检查网络，或先启动代理软件后重试。" -ForegroundColor Red
  Write-Host "  若你的代理软件正常，可改用系统代理：git config --global http.proxy http://127.0.0.1:7897" -ForegroundColor Yellow
  exit 1
}
Write-Host "  连通正常" -ForegroundColor Green

Write-Host "=== 5/5 推送 ===" -ForegroundColor Cyan
Write-Host "  若弹出凭据窗口，请填写：用户名 = Kayo647，密码 = 你的 Personal Access Token" -ForegroundColor Yellow
Write-Host "  （PAT 需要 repo 权限；GitHub 已不支持用账号密码推送）" -ForegroundColor Yellow
git -c http.proxy= -c https.proxy= -c credential.https://github.com.provider=manager push -u origin $branch

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "推送成功。仓库地址：https://github.com/Kayo647/one" -ForegroundColor Green
  Write-Host "若远端是空仓库（刚创建），上面的 push 会自动建立初始分支。" -ForegroundColor Gray
} else {
  Write-Host ""
  Write-Host "推送失败。常见原因：" -ForegroundColor Red
  Write-Host "  - 凭据无效/过期：重新生成 PAT（Settings -> Developer settings -> Personal access tokens）"
  Write-Host "  - 远端已有提交且与本地无关：确认这是你自己的新仓库；如确认可强制覆盖（谨慎）："
  Write-Host "      git -c http.proxy= -c https.proxy= push -u origin $branch --force"
}
