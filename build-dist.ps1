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

# -- Cronometro do build: tempo total + por etapa -----------------------------
# Mesmo padrao do shvterm/build-local.ps1: o "compiled in Xs" do webpack e so
# UMA etapa interna. Aqui medimos o script INTEIRO (yarn -> build:prod ->
# package), por etapa e no total, inclusive quando aborta por erro (trap).
# Serve p/ comparar com macOS/Linux (build-dist.sh) e achar onde otimizar.
$script:buildStart = Get-Date
$script:phases  = New-Object System.Collections.ArrayList
$script:phCur   = $null
$script:phStart = $script:buildStart
function Format-Elapsed([TimeSpan]$d) {  # "1h 02m 03s" / "4m 05s" / "37s"
  if     ($d.TotalHours   -ge 1) { '{0}h {1:00}m {2:00}s' -f [int]$d.TotalHours,   $d.Minutes, $d.Seconds }
  elseif ($d.TotalMinutes -ge 1) { '{0}m {1:00}s'         -f [int]$d.TotalMinutes, $d.Seconds }
  else                           { '{0:0}s'               -f $d.TotalSeconds }
}
function Step([string]$label) {  # fecha a etapa anterior, abre a nova, mostra o relogio
  $now = Get-Date
  if ($script:phCur) {
    [void]$script:phases.Add([pscustomobject]@{ Name = $script:phCur; Span = $now - $script:phStart })
  } elseif (($now - $script:buildStart).TotalSeconds -ge 1) {
    [void]$script:phases.Add([pscustomobject]@{ Name = 'preparacao (prereqs)'; Span = $now - $script:buildStart })
  }
  $script:phCur = $label; $script:phStart = $now
  Write-Host ("==> [{0}] {1}" -f (Format-Elapsed ($now - $script:buildStart)), $label) -ForegroundColor Cyan
}
function Show-BuildSummary {  # tabela final: cada etapa + TOTAL
  if ($script:phCur) {
    [void]$script:phases.Add([pscustomobject]@{ Name = $script:phCur; Span = (Get-Date) - $script:phStart })
    $script:phCur = $null
  }
  Write-Host "`nTempo por etapa (Windows):" -ForegroundColor Green
  foreach ($p in $script:phases) {
    Write-Host ('{0,9}  {1}' -f (Format-Elapsed $p.Span), $p.Name)
  }
  Write-Host '          --------'
  Write-Host ('{0,9}  TOTAL' -f (Format-Elapsed ((Get-Date) - $script:buildStart)))
}
# trap (toda a faixa do script): se abortar por erro, ainda mostra quanto rodou
trap {
  Write-Host ("`nERRO: build abortou apos {0} (Windows)" -f (Format-Elapsed ((Get-Date) - $script:buildStart))) -ForegroundColor Red
  break   # re-lanca o erro original e encerra
}

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

Step "[1/3] yarn (instala deps + baixa o Electron)"
if (-not $SkipInstall) {
  yarn; Assert-Ok "yarn install"
} else {
  Write-Host "    (pulado: -SkipInstall)" -ForegroundColor Yellow
}

Step "[2/3] yarn build:prod (compila producao -> dist/)"
yarn build:prod; Assert-Ok "yarn build:prod"

Step "[3/3] yarn package (gera o instalador do Windows)"
yarn package; Assert-Ok "yarn package"

Write-Host "`nOK: instalador/app em dist/." -ForegroundColor Green
Show-BuildSummary
