#!/usr/bin/env bash
#
# run-local.sh — sobe o dev build do GitHub Desktop (fork multi-repo) no
# macOS/Linux. É o par do run-local.ps1/.cmd (Windows): verifica pré-requisitos,
# instala as dependências e lança o app, parando no primeiro erro.
#
# Para empacotar o app de produção, veja .continue/run-mac-linux.md
# (yarn build:prod + yarn package — disponível em macOS/Windows; Linux ainda não).
#
# PRÉ-REQUISITOS (instalar uma vez):
#   - Node 24.15.0  (>= 22; a dep process-proxy exige). Recomendado via nvm:
#                    nvm install 24.15.0 && nvm use 24.15.0
#   - Yarn (global)  npm install -g yarn  (só p/ bootstrap; o repo usa o vendorizado)
#   - macOS:         Xcode Command Line Tools — xcode-select --install
#   - Linux (Debian/Ubuntu): build-essential + libsecret-1-dev (keytar) + Python 3
#                    sudo apt install build-essential libsecret-1-dev python3
#
# USO (na raiz do repo):
#   ./run-local.sh                 # yarn (se preciso) + build:dev + start
#   ./run-local.sh --skip-install  # pula 'yarn' (deps já instaladas)
#   ./run-local.sh --skip-build    # pula 'yarn build:dev' (só 'yarn start')
#
set -euo pipefail

SKIP_INSTALL=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h | --help)
      sed -n '2,/^set -euo/p' "$0" | sed 's/^#\{0,1\} \{0,1\}//; $d'
      exit 0
      ;;
    *)
      echo "Argumento desconhecido: $arg (use --skip-install, --skip-build)" >&2
      exit 2
      ;;
  esac
done

# raiz do repo = diretório do script
cd "$(cd "$(dirname "$0")" && pwd)"

echo "==> verificando pré-requisitos (node, yarn)..."

if ! command -v node >/dev/null 2>&1; then
  echo "ERRO: node não está no PATH. Instale Node 24.15.0 (nvm install 24.15.0 && nvm use 24.15.0)." >&2
  exit 1
fi

NODE_VER="$(node -v)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERRO: Node $NODE_VER é antigo demais. O projeto exige Node >= 22 (ideal 24.15.0)." >&2
  exit 1
fi
echo "    node $NODE_VER OK"

if ! command -v yarn >/dev/null 2>&1; then
  echo "ERRO: yarn não está no PATH. Rode 'npm install -g yarn' e abra um shell novo." >&2
  exit 1
fi
echo "    yarn OK"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
[ -n "$BRANCH" ] && echo "    branch: $BRANCH"

if [ "$SKIP_INSTALL" -eq 0 ]; then
  echo "==> [1/3] yarn (instala deps + baixa o Electron; demora na 1a vez)..."
  yarn
else
  echo "==> [1/3] yarn install PULADO (--skip-install)"
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "==> [2/3] yarn build:dev (build de desenvolvimento)..."
  yarn build:dev
else
  echo "==> [2/3] build:dev PULADO (--skip-build)"
fi

echo "==> [3/3] yarn start — abre a janela 'GitHub Desktop-dev'."
echo "         (recarregar a UI após mudanças: Ctrl+Alt+R)"
yarn start
