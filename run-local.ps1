#requires -Version 5.1
<#
  run-local.ps1 — Sobe o dev build do GitHub Desktop (fork multi-repo) no Windows.
  Espelha o padrão do build-local.ps1 do shvterm: verifica pré-requisitos, instala
  as dependências e lança o app, com checagem de erro a cada passo.

  PRÉ-REQUISITOS (instalar uma vez):
    - Node 24.15.0   nvm-windows: `nvm install 24.15.0` ; `nvm use 24.15.0`
                     ⚠️ precisa ser Node >= 22 (a dep `process-proxy` exige isso).
    - Yarn (global)  `npm install -g yarn` (só p/ bootstrap; o repo usa o vendorizado).
    - Python 3.x + VS Build Tools "Desktop development with C++" (módulos nativos).

  USO (PowerShell, na raiz do repo):
    .\run-local.ps1                # yarn (se preciso) + build:dev + start
    .\run-local.ps1 -SkipInstall   # pula 'yarn' (deps já instaladas)
    .\run-local.ps1 -SkipBuild     # pula 'yarn build:dev' (só 'yarn start')

  Do cmd, sem mexer na ExecutionPolicy, use o wrapper:  run-local.cmd

  ARMADILHA do nvm-windows (= A-3 do builder shvterm): se `node`/`nvm use` derem
  "não reconhecido", ABRA UM SHELL NOVO (de preferência como Administrador) — o PATH
  novo / o symlink do nvm não chegam num terminal já aberto. `nvm use` persiste depois.
#>
param(
  [switch]$SkipInstall,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot   # raiz do repo

# PowerShell 5.1 não trata exit code != 0 de comando nativo (yarn/node) como erro
# terminante. Sem este check, um passo falho passa batido. Chame após cada passo crítico.
function Assert-Ok([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step falhou (exit $LASTEXITCODE). Corrija o erro acima e rode de novo." }
}

Write-Host "==> verificando pre-requisitos (node, yarn)..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "node nao esta no PATH. Instale Node 24.15.0 (nvm install 24.15.0 ; nvm use 24.15.0) e ABRA UM SHELL NOVO (admin)."
}
$nodeVer   = (node -v).TrimStart('v')
$nodeMajor = [int]($nodeVer.Split('.')[0])
if ($nodeMajor -lt 22) {
  throw "Node $nodeVer e antigo demais — o projeto exige Node >= 22 (ideal 24.15.0). Rode 'nvm use 24.15.0' num shell novo (admin)."
}
Write-Host "    node v$nodeVer OK" -ForegroundColor Green

if (-not (Get-Command yarn -ErrorAction SilentlyContinue)) {
  throw "yarn nao esta no PATH. Rode 'npm install -g yarn' e abra um shell novo."
}
Write-Host "    yarn OK" -ForegroundColor Green

$branch = (git rev-parse --abbrev-ref HEAD 2>$null)
if ($LASTEXITCODE -eq 0) { Write-Host "    branch: $($branch.Trim())" -ForegroundColor Green }

if (-not $SkipInstall) {
  Write-Host "==> [1/3] yarn (instala deps + baixa o Electron; demora na 1a vez)..." -ForegroundColor Cyan
  yarn; Assert-Ok "yarn install"
} else {
  Write-Host "==> [1/3] yarn install PULADO (-SkipInstall)" -ForegroundColor Yellow
}

if (-not $SkipBuild) {
  Write-Host "==> [2/3] yarn build:dev (build de desenvolvimento)..." -ForegroundColor Cyan
  yarn build:dev; Assert-Ok "yarn build:dev"
} else {
  Write-Host "==> [2/3] build:dev PULADO (-SkipBuild)" -ForegroundColor Yellow
}

Write-Host "==> [3/3] yarn start — abre a janela 'GitHub Desktop-dev'." -ForegroundColor Cyan
Write-Host "         (recarregar a UI apos mudancas: Ctrl+Alt+R)" -ForegroundColor DarkGray
yarn start
