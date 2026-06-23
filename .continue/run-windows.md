# Rodar o dev build no Windows

> Para subir o fork (branch `multi-repo-dashboard`) numa VM Windows e **validar a Fase 1
> visualmente**. Base: `docs/contributing/setup-windows.md` + os fixes do commit `eb88c78f78`.

## Pré-requisitos (instalar 1x na VM)

| Ferramenta | Versão | Nota |
|-----------|--------|------|
| **Node.js** | **24.15.0** (`.node-version`) | ⚠️ Uma dep (`process-proxy`) exige Node **≥22** — Node 20 **falha** no `yarn install`. Recomendado: nvm-windows → `nvm install 24.15.0 && nvm use 24.15.0`. |
| **Yarn** (global) | 1.x | Só p/ bootstrap: `npm install -g yarn`. O repo usa o yarn **vendorizado** (`vendor/yarn-1.21.1.js`) via `.yarnrc`; o global só precisa existir no PATH. |
| **Python** | 3.9.x | Para node-gyp (módulos nativos). Marcar **"Add python.exe to PATH"**. |
| **Visual C++ Build Tools** | 2019+ | Workload **"Desktop development with C++"**. Depois `npm config set msvs_version 2022` (ou 2019, conforme instalado). A VM que builda o shvterm provavelmente já tem. |

Verificar: `node -v` (v24.x), `yarn -v` (1.x), `python --version` (3.9.x).

## Subir o app

> ⚠️ No **Prompt de Comando (cmd)** o `#` **não** é comentário. Se colar
> `git checkout multi-repo-dashboard # ...` o git trata cada palavra do comentário como um
> arquivo e falha (erro `pathspec ... did not match`). Cole **só o comando**, uma linha por
> vez, sem o texto após `#`. (No PowerShell o `#` funciona normalmente.)

```
git clone https://github.com/samirhvbr/GITHUB_DESKTOP.git
cd GITHUB_DESKTOP
git checkout multi-repo-dashboard
npm install -g yarn
yarn
yarn build:dev
yarn start
```

`checkout` entra na branch com a Fase 1 + fixes de Windows · `npm install -g yarn` instala o
yarn (só p/ bootstrap; o repo usa o vendorizado) · `yarn` baixa deps + Electron (demora) ·
`build:dev` compila · `start` abre a janela "GitHub Desktop-dev".

- Mudou algo em `app/src/main-process/`? Rode `yarn build:dev` de novo, depois `yarn start`.
- Recarregar só a UI (após mudanças no renderer): **Ctrl+Alt+R**.
- O fix `eb88c78f78` já trata o `ELECTRON_RUN_AS_NODE` (sem ele a janela não abria) e isola o
  `userData` dev em `GitHub Desktop-dev` (roda lado a lado com um GitHub Desktop de produção).

## Validar a Fase 1 (painel multi-repo)

1. Adicione alguns repositórios no app (File → Add local repository) — de preferência uns com
   alterações pendentes e/ou atrás do remoto, p/ ver os destaques.
2. Clique no nome do repositório na toolbar (abre o foldout da lista de repos).
3. Ao lado do botão **Add**, há um **novo botão-ícone (lista)** → abre o **Painel de repositórios**.
4. Confira: lista todos os repos, com os que têm demanda (alterações não commitadas / atrás do
   remoto) **no topo**, com indicadores; clicar num repo abre ele; "Fechar" volta.

## Troubleshooting

- App "trava" / não abre: apague `C:\Users\<voce>\AppData\Roaming\GitHub Desktop-dev`.
- `yarn install` falha com "engine node incompatible": está com Node < 22 — instale o 24.15.0.
- Erro de compilação de módulo nativo: falta o **VC++ Build Tools** / Python no PATH.
