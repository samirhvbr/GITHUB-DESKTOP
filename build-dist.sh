#!/usr/bin/env bash
#
# build-dist.sh — build de PRODUÇÃO do fork (macOS/Linux). É o par do
# build-dist.ps1/.cmd (Windows).
#
#   yarn build:prod  → compila produção e gera o app empacotável em dist/ (os 3 SOs)
#   yarn package     → gera o instalador do SO atual:
#                      macOS  → .app zipado | Windows → Squirrel (.exe/.msi/.nupkg)
#                      Linux  → .deb + .rpm + AppImage (best-effort)
#
# Cada SO buildа no próprio SO (Electron não faz cross-build).
#
# USO (na raiz do repo):
#   ./build-dist.sh                 # yarn + build:prod (+ package no macOS)
#   ./build-dist.sh --skip-install  # pula 'yarn'
#
set -euo pipefail

SKIP_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    -h | --help)
      sed -n '2,/^set -euo/p' "$0" | sed 's/^#\{0,1\} \{0,1\}//; $d'
      exit 0
      ;;
    *)
      echo "Argumento desconhecido: $arg (use --skip-install)" >&2
      exit 2
      ;;
  esac
done

cd "$(cd "$(dirname "$0")" && pwd)"

echo "==> verificando pré-requisitos (node, yarn)..."
if ! command -v node >/dev/null 2>&1; then
  echo "ERRO: node não está no PATH. Instale Node 24.15.0 (nvm install 24.15.0 && nvm use 24.15.0)." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERRO: Node $(node -v) é antigo demais. O projeto exige Node >= 22 (ideal 24.15.0)." >&2
  exit 1
fi
echo "    node $(node -v) OK"
if ! command -v yarn >/dev/null 2>&1; then
  echo "ERRO: yarn não está no PATH. Rode 'npm install -g yarn'." >&2
  exit 1
fi
echo "    yarn OK"

if [ "$SKIP_INSTALL" -eq 0 ]; then
  echo "==> [1/3] yarn (instala deps + baixa o Electron)..."
  yarn
else
  echo "==> [1/3] yarn install PULADO (--skip-install)"
fi

echo "==> [2/3] yarn build:prod (compila produção → dist/)..."
yarn build:prod

OS="$(uname -s)"
case "$OS" in
  Darwin)
    echo "==> [3/3] yarn package (gera o instalador do macOS)..."
    yarn package
    echo "OK: instalador/app em dist/."
    ;;
  Linux)
    echo "==> [3/3] yarn package (gera .deb + AppImage no host)..."
    echo "    .deb: requer dpkg + fakeroot | AppImage: baixa o appimagetool sozinho."
    echo "    Best-effort: o formato cuja ferramenta faltar é pulado (não quebra o build)."
    yarn package
    echo "OK: .deb + AppImage em dist/ (veja o resumo acima)."
    echo "    .rpm nativo: rode ./build-rpm-docker.sh — a lib de RPM quebra com o RPM"
    echo "    4.20 do Debian, então geramos num container RHEL. (O AppImage já roda em"
    echo "    distros RPM, então o .rpm é opcional.)"
    ;;
  *)
    echo "==> [3/3] SO '$OS' desconhecido para empacotar; build:prod concluído em dist/."
    ;;
esac
