#!/usr/bin/env bash
#
# build-dist.sh — build de PRODUÇÃO do fork (macOS/Linux). É o par do
# build-dist.ps1/.cmd (Windows).
#
#   yarn build:prod  → compila produção e gera o app empacotável em dist/
#   yarn package     → gera o instalador do SO atual:
#                      macOS  → .zip do .app (auto-update) + .dmg (distribuição)
#                      Windows → Squirrel (.exe/.msi/.nupkg)
#                      Linux  → .deb + .rpm + AppImage (best-effort)
#
# Cada SO buildа no próprio SO (Electron não faz cross-build).
#
# macOS — assinatura & notarização (pra NÃO ir pro lixo do Gatekeeper):
#   o script carrega as credenciais SOZINHO de ~/.config/sshvterm/build.env (mesmo
#   arquivo do shvterm; aponte outro com $SSHVTERM_BUILD_ENV) e mapeia
#   APPLE_PASSWORD → APPLE_ID_PASSWORD (o nome que o GitHub Desktop espera). O
#   certificado Developer ID vem do keychain (auto-descoberto pelo build:prod).
#   Sem as credenciais o build ABORTA (sairia ad-hoc = "danificado" pra quem
#   baixa); use --allow-adhoc p/ um build de TESTE local não-distribuível. No
#   fim faz staple do ticket e confere com spctl + stapler. Detalhes:
#   .continue/MACOS_BUILD.md.
#
# USO (na raiz do repo):
#   ./build-dist.sh                 # yarn + build:prod + package
#   ./build-dist.sh --skip-install  # pula 'yarn'
#   ./build-dist.sh --allow-adhoc   # macOS: build AD-HOC de teste (NÃO distribuível)
#
set -euo pipefail

SKIP_INSTALL=0
ALLOW_ADHOC=0
for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --allow-adhoc) ALLOW_ADHOC=1 ;;
    -h | --help)
      sed -n '2,/^set -euo/p' "$0" | sed 's/^#\{0,1\} \{0,1\}//; $d'
      exit 0
      ;;
    *)
      echo "Argumento desconhecido: $arg (use --skip-install / --allow-adhoc)" >&2
      exit 2
      ;;
  esac
done

cd "$(cd "$(dirname "$0")" && pwd)"

# ── Cronômetro do build: tempo total (parede) + por etapa ───────────────────
# Mesmo padrão do shvterm/build-local.sh: o "compiled in Xs" do webpack é só
# UMA etapa interna. Aqui medimos o script INTEIRO (yarn → build:prod →
# package), por etapa e no total, e imprimimos mesmo quando aborta por erro
# (trap EXIT). Serve p/ comparar macOS × Linux × Windows e achar onde otimizar.
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
    _PH_NAMES+=("preparação (prereqs + credenciais)"); _PH_TIMES+=("$now")
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

OS="$(uname -s)"

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
# .nvmrc fixa 24.15.0. >= 22 compila, mas node muito novo (26+) é bleeding-edge e
# pode quebrar dependências nativas na hora do build — avisa (sem abortar).
if [ "$NODE_MAJOR" -ne 24 ]; then
  echo "⚠️  node $(node -v): o projeto fixa 24.15.0 (.nvmrc); >= 22 roda, mas se o build" >&2
  echo "    falhar adiante em módulo nativo, use 'nvm install 24.15.0 && nvm use 24.15.0'." >&2
fi

# yarn: se faltar, INSTALA sozinho (npm -g, o caminho que já funciona aqui) em vez
# de só mandar rodar na mão. O projeto usa yarn classic (engines: yarn >= 1.9).
if ! command -v yarn >/dev/null 2>&1; then
  echo "    yarn ausente — instalando ('npm install -g yarn')..."
  if ! npm install -g yarn; then
    echo "ERRO: 'npm install -g yarn' falhou. Instale o yarn na mão e rode de novo." >&2
    exit 1
  fi
  hash -r 2>/dev/null || true   # zera o cache de lookup do shell atual após instalar
  if ! command -v yarn >/dev/null 2>&1; then
    echo "ERRO: yarn instalado, mas fora do PATH deste shell." >&2
    echo "      O bin global do npm ($(npm prefix -g 2>/dev/null)/bin) não está no PATH;" >&2
    echo "      abra um terminal novo (ou ajuste o PATH) e rode de novo." >&2
    exit 1
  fi
  echo "    yarn $(yarn -v) instalado OK"
else
  echo "    yarn $(yarn -v 2>/dev/null) OK"
fi

# ── macOS: credenciais de assinatura/notarização (anti-"vai pro lixo") ──────────
# build:prod assina (Developer ID do keychain) e — se estas variáveis estiverem no
# ambiente — notariza. Sem notarizar, o app é barrado no Mac de quem baixa. Em vez
# de exigir `source ...` manual, carregamos o mesmo build.env do shvterm e mapeamos
# o nome da senha. Detalhes: .continue/MACOS_BUILD.md.
MAC_SIGNED=0
if [ "$OS" = "Darwin" ]; then
  CREDS_FILE="${SSHVTERM_BUILD_ENV:-$HOME/.config/sshvterm/build.env}"
  if [ -f "$CREDS_FILE" ]; then
    echo "==> macOS: carregando credenciais de $CREDS_FILE"
    # shellcheck disable=SC1090
    if ! . "$CREDS_FILE"; then
      echo "❌ falha ao ler $CREDS_FILE — confira aspas/sintaxe (export VAR=\"...\")." >&2
      exit 1
    fi
  else
    echo "⚠️  macOS: $CREDS_FILE não encontrado (a notarização precisa dele)." >&2
  fi

  # shvterm chama a senha app-specific de APPLE_PASSWORD; o GitHub Desktop quer
  # APPLE_ID_PASSWORD. Mapeia sem sobrescrever um valor já setado.
  export APPLE_ID_PASSWORD="${APPLE_ID_PASSWORD:-${APPLE_PASSWORD:-}}"

  # Guarda anti-ad-hoc: precisa das 3 variáveis de notarização + uma identidade
  # "Developer ID Application" no keychain. A identidade é capturada numa variável
  # ANTES do grep (um `security ... | grep -q` sob pipefail pode dar falso negativo
  # por SIGPIPE quando o grep fecha o pipe no match — vide MACOS_BUILD.md).
  missing=
  for v in APPLE_ID APPLE_ID_PASSWORD APPLE_TEAM_ID; do
    [ -n "${!v:-}" ] || missing="$missing $v"
  done
  ids="$(security find-identity -v -p codesigning 2>/dev/null || true)"
  if ! grep -q 'Developer ID Application' <<<"$ids"; then
    missing="$missing Developer-ID-ausente-no-keychain"
  fi

  if [ -z "$missing" ]; then
    MAC_SIGNED=1
    echo "    ✓ macOS: assino (Developer ID do keychain) + notarizo"
  elif [ "$ALLOW_ADHOC" = 1 ]; then
    echo "⚠️  --allow-adhoc: build AD-HOC (roda nesta máquina, NÃO distribuir)." >&2
    echo "    faltando:${missing}" >&2
  else
    echo "❌ macOS: faltam credenciais p/ notarizar — NÃO vou buildar (sairia ad-hoc =" >&2
    echo "   \"danificado\" pra quem baixar). faltando:${missing}" >&2
    echo "   Preencha $CREDS_FILE (mesmo do shvterm) ou rode --allow-adhoc p/ teste." >&2
    echo "   Detalhes: .continue/MACOS_BUILD.md." >&2
    exit 1
  fi
fi

step "[1/3] yarn (instala deps + baixa o Electron)"
if [ "$SKIP_INSTALL" -eq 0 ]; then
  yarn
else
  echo "    (pulado: --skip-install)"
fi

step "[2/3] yarn build:prod (compila produção + assina/notariza no macOS → dist/)"
yarn build:prod

# ── macOS: gruda (staple) o ticket no .app antes de empacotar ───────────────────
# Assim o .app abre offline e o .dmg/.zip carregam um app já validável sem rede.
# build:prod notariza; o staple aqui é idempotente (re-staple é inofensivo) e ainda
# pega uma notarização que tenha falhado em silêncio (stapler aborta sem ticket).
if [ "$OS" = "Darwin" ] && [ "$MAC_SIGNED" = 1 ]; then
  app="$(find dist -maxdepth 3 -name '*.app' -type d 2>/dev/null | head -1)"
  if [ -n "$app" ]; then
    echo "==> macOS: stapling do ticket de notarização em $app"
    if ! xcrun stapler staple "$app"; then
      echo "❌ stapler staple falhou — o .app foi mesmo notarizado? (veja o erro acima)" >&2
      exit 1
    fi
  fi
fi

case "$OS" in
  Darwin)
    step "[3/3] yarn package (.zip de auto-update + .dmg de distribuição)"
    yarn package
    if [ "$MAC_SIGNED" = 1 ]; then
      echo "==> macOS: conferindo Developer ID + notarização do .app..."
      app="$(find dist -maxdepth 3 -name '*.app' -type d 2>/dev/null | head -1)"
      if [ -z "$app" ]; then
        echo "❌ não encontrei o .app em dist/ para verificar." >&2
        exit 1
      fi
      # Veredito pelo EXIT CODE direto do spctl/stapler (não `codesign | grep`).
      if ! spctl -a -t exec "$app" >/dev/null 2>&1; then
        echo "❌ .app rejeitado pelo Gatekeeper (ad-hoc / não notarizado)." >&2
        exit 1
      fi
      if ! xcrun stapler validate "$app" >/dev/null 2>&1; then
        echo "❌ .app sem ticket de notarização grudado (não abriria offline)." >&2
        exit 1
      fi
      echo "    ✓ Developer ID + notarização confirmados — distribuível"
    fi
    echo "OK: .zip (auto-update) + .dmg (distribuição) em dist/."
    ;;
  Linux)
    step "[3/3] yarn package (gera .deb + AppImage no host)"
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
_summary
