# VERSION

Versão do **fork multi-repositório** do GitHub Desktop — independente da versão
do app _upstream_ (`app/package.json`, hoje `3.6.2`), que indica em qual
release do GitHub Desktop este fork é baseado.

> Fonte de verdade no código: [`app/src/lib/fork-version.ts`](app/src/lib/fork-version.ts).
> Ao subir a versão, atualize **os dois** — a constante e este arquivo.
> A versão em execução aparece na tela inicial ("Let's get started!") e no
> diálogo **About**.

## 0.4.0 — atual

- **Painel de repositórios — ações em lote:**
  - **Pull/Push em lote** nos repos selecionados (checkbox por linha + "Selecionar
    todos"), sincronizando **até 3 ao mesmo tempo** (`p-limit`); feedback por repo
    (spinner → ✓ ok / ✗ erro com tooltip) e refresh do status ao terminar.
  - **Status agregado atualizado ao abrir** o painel (auto-refresh via `loadStatus`
    local) + botão **Atualizar**; resumo no header (para commitar / atrás / à frente).
    Novo `dispatcher.refreshRepositoryIndicator`.
  - **Tela de relatório (botão "Status"):** resumo por categoria (para commitar,
    atrás, à frente, sem upstream, atualizados) + resultado da última ação em lote,
    com **"Copiar relatório"** (log em texto).
  - **Zebra** (linhas pares mais claras) e **X** vermelho em erro; falhas também
    no log do app.
- **Multiplataforma:** `run-local.sh` (dev Mac/Linux) e `build-dist.sh`/`.ps1`/`.cmd`
  (produção) + guia [run-mac-linux.md](.continue/run-mac-linux.md). Empacotamento de
  instalador: macOS/Windows ✅; **Linux `.deb`** via `packageLinux()` no
  `script/package.ts` (electron-installer-debian) — **validado no Debian** (build + instalação OK).
- **Nome dos artefatos padronizado** (todos em `dist/`): cada instalador leva no
  nome a versão _upstream_ **e** a do fork, no formato
  `GitHub-Desktop_<upstream>_fork-<fork>_<arch>.<ext>` — ex.:
  `GitHub-Desktop_3.6.2_fork-0.4.0_amd64.deb`. Vale para `.deb`, `.rpm`,
  AppImage e `.dmg` (`forkArtifactName()` em `script/package.ts`). Os feeds de
  auto-update — `.zip` do macOS e os arquivos do Windows — mantêm o nome
  convencional exigido pelo Squirrel.

## 0.3.0

- **Select all** no clone em lote: marca/desmarca todos de uma vez, com 3 estados
  (todos / alguns / nenhum) e respeitando o filtro de busca.
- Polimentos do clone em lote:
  - o scroll não volta mais ao topo a cada seleção;
  - lista mais leve (item virou `PureComponent` + `matches` referencialmente
    estável na `SectionFilterList`);
  - repositórios que já existem na pasta são **pulados** com aviso (banner), em
    vez do popup de erro "destination already exists / Retry clone".

## 0.2.0 — Clone seletivo (Fase 2)

- `API.streamPublicRepositories` — lista repos públicos de um usuário arbitrário.
- Clone em lote: multi-seleção por checkbox + botão "Clone N repositories" numa
  pasta raiz comum (uma subpasta por repo), no branch default.

## 0.1.0 — Painel multi-repo (Fase 1)

- Tela que lista todos os repositórios e destaca os que têm demanda (commit
  pendente / atrás do remoto), reusando `localRepositoryStateLookup` +
  `RepositoryIndicatorUpdater`.
