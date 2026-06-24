#requires -Version 5.1
<#
  build-dist.ps1 - build de PRODUCAO do fork (Windows). Par do build-dist.sh.

    yarn build:prod  -> compila producao e gera o app em dist/
    yarn package     -> gera o instalador do Windows (electron-winstaller)

  Arquivo em ASCII puro de proposito (Windows PowerShell 5.1 le .ps1 sem BOM
  como ANSI; acentos quebrariam o parsing).

  USO (PowerShell, na raiz do repo):
    .\build-dist.ps1                # yarn + build:prod + package
    .\build-dist.ps1 -SkipInstall   # pula 'yarn'

  Do cmd, use o wrapper:  build-dist.cmd
#>
param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Assert-Ok([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step falhou (exit $LASTEXITCODE). Corrija o erro acima e rode de novo." }
}

Write-Host "==> verificando pre-requisitos (node, yarn)..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "node nao esta no PATH. Instale Node 24.15.0 (nvm install 24.15.0 ; nvm use 24.15.0)."
}
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
  throw "Node antigo demais. O projeto exige Node >= 22 (ideal 24.15.0)."
}
Write-Host "    node $(node -v) OK" -ForegroundColor Green

if (-not (Get-Command yarn -ErrorAction SilentlyContinue)) {
  throw "yarn nao esta no PATH. Rode 'npm install -g yarn'."
}
Write-Host "    yarn OK" -ForegroundColor Green

if (-not $SkipInstall) {
  Write-Host "==> [1/3] yarn (instala deps + baixa o Electron)..." -ForegroundColor Cyan
  yarn; Assert-Ok "yarn install"
} else {
  Write-Host "==> [1/3] yarn install PULADO (-SkipInstall)" -ForegroundColor Yellow
}

Write-Host "==> [2/3] yarn build:prod (compila producao -> dist/)..." -ForegroundColor Cyan
yarn build:prod; Assert-Ok "yarn build:prod"

Write-Host "==> [3/3] yarn package (gera o instalador do Windows)..." -ForegroundColor Cyan
yarn package; Assert-Ok "yarn package"

Write-Host "OK: instalador/app em dist/." -ForegroundColor Green
