@echo off
REM Wrapper p/ rodar run-local.ps1 a partir do cmd, sem mexer na ExecutionPolicy.
REM Uso:  run-local.cmd  [-SkipInstall] [-SkipBuild]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-local.ps1" %*
