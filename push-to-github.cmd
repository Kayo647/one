@echo off
REM Double-click this file to push the repo to https://github.com/Kayo647/one
REM It runs via cmd to avoid PowerShell ExecutionPolicy errors.
REM On the first push a credential window appears: user = Kayo647,
REM password = your Personal Access Token (needs 'repo' scope).
REM ASCII only on purpose: cmd.exe decodes .cmd files as ANSI (GBK here),
REM so non-ASCII text would be corrupted.
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo  Pushing to https://github.com/Kayo647/one
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-to-github.ps1"
echo.
echo ------------------------------------------------------------
echo  If it failed, copy the error output and report it.
echo ------------------------------------------------------------
pause
