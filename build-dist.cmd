@echo off
REM Wrapper p/ rodar build-dist.ps1 a partir do cmd, sem mexer na ExecutionPolicy.
REM Uso:  build-dist.cmd  [-SkipInstall]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-dist.ps1" %*
