# Rodar / buildar no macOS e Linux

> Par do [run-windows.md](run-windows.md). O fork é **Electron + TS + React** e o
> nosso código é **multiplataforma** (só usa o módulo `path` do Node, React e o
> dispatcher do app — nada específico de SO). A base do GitHub Desktop já tem os
> globais `__DARWIN__`, `__WIN32__` e `__LINUX__`.
>
> ⚠️ **Cada SO buildа no próprio SO** (app Electron): use o Mac para o build do
> Mac, o Linux para o do Linux, o Windows para o do Windows. Não há cross-build.

## Rodar o dev build (macOS / Linux)

Com os pré-requisitos instalados, na raiz do repo:

```
./run-local.sh                 # yarn (se preciso) + build:dev + start
./run-local.sh --skip-install  # pula 'yarn'
./run-local.sh --skip-build    # só 'yarn start'
```

(Equivale ao `run-local.cmd`/`.ps1` do Windows. Se não tiver permissão de
execução: `chmod +x run-local.sh`.)

## Pré-requisitos (instalar 1x)

| Ferramenta | Versão | Nota |
|-----------|--------|------|
| **Node.js** | **24.15.0** (`.node-version`) | `>= 22` obrigatório (dep `process-proxy`). Recomendado nvm: `nvm install 24.15.0 && nvm use 24.15.0`. |
| **Yarn** (global) | 1.x | `npm install -g yarn` (só bootstrap; o repo usa o vendorizado). |
| **Python** | 3.x | Para node-gyp (módulos nativos). |

### macOS
- **Xcode Command Line Tools:** `xcode-select --install` (compila os módulos nativos: keytar, etc.).

### Linux (Debian Trixie / Ubuntu, Gnome)
- `sudo apt install build-essential libsecret-1-dev python3`
  - **libsecret-1-dev** é necessário para o **keytar** (armazenamento de tokens).
- Bibliotecas de runtime do Electron costumam já vir no Gnome; se a janela não
  abrir, instalar as libs do Chromium/Electron (ex.: `libgtk-3-0`, `libnss3`,
  `libasound2`).

## Empacotamento de produção (instalador / app distribuível)

| Plataforma | `yarn build:prod` | `yarn package` | Resultado |
|-----------|:---:|:---:|-----------|
| **macOS** | ✅ | ✅ | `.app` / `.zip` (assinatura à parte) |
| **Windows** | ✅ | ✅ | instalador (electron-winstaller) |
| **Linux** | ✅ (compila) | ❌ | `script/package.ts` só trata `darwin`/`win32` → imprime *"I don't know how to package for linux"*. **Empacotar no Linux exige portar** o setup (estilo `shiftkey/desktop`: electron-installer-debian / appimage). |

Ou seja: **dev build + run funciona nos 3**; **instalador de produção** sai em
**macOS e Windows** hoje. Linux roda em dev; o pacote `.deb`/AppImage é trabalho
futuro.

```
yarn               # deps
yarn build:prod    # compila produção (os 3)
yarn package       # empacota (macOS/Windows)
```

## Validação (status 2026-06-23)

- ✅ **Windows:** build de dev + run validados (todas as features do fork).
- ⏳ **macOS / Linux:** código é portável, mas **ainda não buildado/rodado** —
  validar com `./run-local.sh` quando houver acesso a cada máquina/VM.

## Troubleshooting

- **`run-local.sh: bad interpreter` / `\r`:** o arquivo veio com CRLF. O
  `.gitattributes` força `*.sh eol=lf`; se persistir, rode `dos2unix run-local.sh`.
- **Erro compilando keytar (Linux):** falta `libsecret-1-dev`.
- **`engine node incompatible`:** Node < 22 — instale o 24.15.0.
- **App sobe mas não abre janela:** instância dev anterior segurando o lock —
  finalize o processo `GitHubDesktop-dev`/`electron` e reabra com
  `./run-local.sh --skip-install --skip-build`.
