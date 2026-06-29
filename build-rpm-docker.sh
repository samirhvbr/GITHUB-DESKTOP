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

echo "==> ${ENGINE[*]} + $IMAGE (RPM compatível com a lib)"

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
echo "OK: .rpm em dist/ (gerado em $IMAGE)."
ls -1 dist/*.rpm 2>/dev/null || echo "  (nenhum .rpm encontrado — veja o log acima)"
