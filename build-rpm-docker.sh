#!/usr/bin/env bash
#
# build-rpm-docker.sh — gera o .rpm dentro de um container da família RHEL.
#
# Por quê: a lib `electron-installer-redhat` (3.4.0, abandonada) quebra com o
# RPM 4.20+ (Debian recente, Fedora >= 41). AlmaLinux/Rocky 9 trazem RPM 4.16
# — que é justamente a família que consome .rpm — onde a lib funciona.
#
# Pré-requisito: o app já buildado (`yarn build:prod` → dist/desktop-linux-x64)
# e Docker OU podman instalado. O .deb e o AppImage saem do build normal no
# host (`yarn package`); este script cuida só do .rpm.
#
# USO (na raiz do repo):
#   ./build-rpm-docker.sh                 # usa almalinux:9
#   RPM_IMAGE=rockylinux:9 ./build-rpm-docker.sh
#
# Se o seu usuário não estiver no grupo 'docker', o script cai pra sudo
# automaticamente (e ainda assim devolve os arquivos pro seu usuário).
#
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)"

# ── Cronômetro do build: tempo total (parede) + por etapa ───────────────────
# Mesmo padrão do shvterm/build-local.sh: mede o script inteiro (checagens →
# container com dnf + rpmbuild), por etapa e no total, e imprime mesmo quando
# aborta por erro (trap EXIT).
SECONDS=0
_BUILD_OS=$(uname -s); [ "$_BUILD_OS" = Darwin ] && _BUILD_OS=macOS
_PH_NAMES=(); _PH_TIMES=(); _PH_CUR=""; _PH_START=0
_fmt() {  # $1 = segundos -> "1h 02m 03s" / "4m 05s" / "37s"
  local t=$1
  if   [ "$t" -ge 3600 ]; then printf '%dh %02dm %02ds' $((t/3600)) $(((t%3600)/60)) $((t%60))
  elif [ "$t" -ge 60 ];   then printf '%dm %02ds' $((t/60)) $((t%60))
  else                         printf '%ds' "$t"; fi
}
step() {  # fecha a etapa anterior, abre a nova, e mostra o relógio corrente
  local now=$SECONDS
  if [ -n "$_PH_CUR" ]; then
    _PH_NAMES+=("$_PH_CUR"); _PH_TIMES+=($((now - _PH_START)))
  elif [ "$now" -gt 0 ]; then
    _PH_NAMES+=("preparação (engine + checagens)"); _PH_TIMES+=("$now")
  fi
  _PH_CUR="$1"; _PH_START=$now
  echo "==> [$(_fmt "$now")] $1"
}
_summary() {  # tabela final: cada etapa + TOTAL
  if [ -n "$_PH_CUR" ]; then
    _PH_NAMES+=("$_PH_CUR"); _PH_TIMES+=($((SECONDS - _PH_START))); _PH_CUR=""
  fi
  echo ""
  echo "⏱  tempo por etapa ($_BUILD_OS):"
  if [ "${#_PH_NAMES[@]}" -gt 0 ]; then
    local i
    for i in "${!_PH_NAMES[@]}"; do
      printf '     %8s  %s\n' "$(_fmt "${_PH_TIMES[$i]}")" "${_PH_NAMES[$i]}"
    done
  fi
  echo "     ────────"
  printf '     %8s  TOTAL\n' "$(_fmt "$SECONDS")"
}
_on_exit() {  # se abortar (exit != 0), ainda mostra quanto tempo rodou
  local code=$?
  if [ "$code" -ne 0 ]; then
    echo "" >&2
    echo "❌ build abortou após $(_fmt "$SECONDS")  ($_BUILD_OS, exit $code)" >&2
  fi
}
trap _on_exit EXIT

IMAGE="${RPM_IMAGE:-almalinux:9}"

# Usuário real mesmo quando rodado via sudo (pra chown dos artefatos no fim).
REAL_UID="${SUDO_UID:-$(id -u)}"
REAL_GID="${SUDO_GID:-$(id -g)}"

# Docker ou podman — o que estiver disponível. ENGINE é um array porque pode
# virar "sudo docker".
if command -v podman >/dev/null 2>&1; then
  ENGINE=(podman)
elif command -v docker >/dev/null 2>&1; then
  ENGINE=(docker)
  # Sem acesso ao docker.sock? Cai pra sudo.
  if ! docker info >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      echo "    (sem acesso ao docker.sock — usando sudo)"
      ENGINE=(sudo docker)
    else
      echo "ERRO: sem acesso ao daemon do Docker. Adicione seu usuário ao grupo" >&2
      echo "      docker ('sudo usermod -aG docker \$USER' e relogue) ou rode com sudo." >&2
      exit 1
    fi
  fi
else
  echo "ERRO: precisa de docker ou podman instalado." >&2
  exit 1
fi

if [ ! -d "dist/desktop-linux-x64" ]; then
  echo "ERRO: dist/desktop-linux-x64 não existe. Rode 'yarn build:prod' antes." >&2
  exit 1
fi

if [ ! -d "node_modules/electron-installer-redhat" ]; then
  echo "ERRO: node_modules/electron-installer-redhat ausente. Rode 'yarn' antes." >&2
  exit 1
fi

step "container ${ENGINE[*]} + $IMAGE (toolchain + rpmbuild)"

# Roda como root no container (precisa pra dnf); no fim devolve os arquivos de
# dist/ pro usuário do host. -v monta o repo inteiro (inclui node_modules/.git).
# shellcheck disable=SC2016  # HOST_UID/HOST_GID expandem DENTRO do container, não aqui
"${ENGINE[@]}" run --rm \
  -v "$PWD:/work" -w /work \
  -e HOST_UID="$REAL_UID" -e HOST_GID="$REAL_GID" \
  "$IMAGE" bash -c '
    set -e
    echo "==> instalando toolchain (nodejs, rpm-build, git)…"
    dnf install -y -q nodejs rpm-build git >/dev/null

    # ImageMagick (para o ícone) é best-effort: vem do EPEL. Sem ele, o .rpm
    # ainda é gerado, só que sem ícone customizado.
    if ! { dnf install -y -q epel-release >/dev/null 2>&1 \
        && dnf install -y -q ImageMagick >/dev/null 2>&1; }; then
      echo "    (ImageMagick indisponível — .rpm sairá sem ícone customizado)"
    fi

    echo "==> rpmbuild $(rpmbuild --version | awk "{print \$3}")"
    echo "==> empacotando .rpm…"
    LINUX_FORMATS=rpm node_modules/.bin/ts-node -P script/tsconfig.json script/package.ts

    # Docker roda como root → devolve os artefatos pro dono do host.
    chown -R "${HOST_UID}:${HOST_GID}" dist 2>/dev/null || true
  '

echo ""
echo "[OK] .rpm em dist/ (gerado em $IMAGE):"
ls -1 dist/*.rpm 2>/dev/null || echo "  (nenhum .rpm encontrado — veja o log acima)"
_summary
