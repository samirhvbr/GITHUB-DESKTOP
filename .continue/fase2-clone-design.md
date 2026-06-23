# Fase 2 — Clone seletivo · Design de implementação

> Demandas 3-5 do `SAMIR-PROJETO.md`. A Fase 2a (API) já está feita; este doc é o
> passo a passo da UI para a próxima sessão. Referências `arquivo:linha`.

## Estado atual do código de clone (lido em 23/06)

- `clone-repository.tsx` — container com 3 abas (`CloneRepositoryTab`: DotCom / Enterprise /
  Generic-URL), estado **por aba** (`dotComTabState` / `enterpriseTabState` / `urlTabState`),
  cada um com `selectedItem: IAPIRepository | null` (**seleção única**) e `path: string | null`.
- `clone-github-repository.tsx` — renderiza `CloneableRepositoryFilterList` (single) + 1 campo
  "Local path" + botão "Choose…".
- `cloneable-repository-filter-list.tsx` — `SectionFilterList` com `selectedItem` único.
- `clone()` / `cloneImpl()` (`clone-repository.tsx:759/793`) — clona **1 repo** via
  `dispatcher.clone(url, path, {defaultBranch})`. O dispatcher/cloningStore **já suportam N
  clones concorrentes** (cada um vira um `CloningRepository`).
- ✅ `API.streamPublicRepositories(login, cb, opts)` já adicionado em `api.ts` (demanda 5 backend).

## Decisões de design

### A. Multi-seleção (demanda 3) — sem regressão
- Adicionar prop `multiSelect?: boolean` a `CloneableRepositoryFilterList`. Quando `true`,
  renderiza **checkbox por item** e usa `selectedItems: ReadonlyArray<IAPIRepository>` +
  `onSelectionChanged(items)`. Default (`false`) mantém o single-select atual → zero regressão.
- No estado por aba, adicionar `selectedItems` ao lado de `selectedItem` (ou migrar p/ array).

### B. Clone em lote + pasta (demanda 3)
- **Modo "pasta raiz comum" (MVP):** usuário escolhe 1 pasta raiz; destino de cada repo =
  `Path.join(root, repo.name)`. Validar cada um com `validateEmptyFolder` (`:682`).
- **Modo "pasta individual" (v2, opcional):** um picker por repo.
- Disparo: loop sobre os selecionados →
  `dispatcher.clone(repo.clone_url, Path.join(root, repo.name), {defaultBranch: repo.default_branch})`.
- UI: quando multi, trocar "Local path" único por "Pasta raiz" + preview dos destinos.

### C. Aba "Usuário público" (demanda 5)
- Nova `CloneRepositoryTab.PublicUser` + `publicUserTabState`
  (`{ login, repositories, loading, selectedItems, rootPath, error }`).
- UI: `TextBox` de login + botão "Buscar" → dispara a carga → popula a MESMA
  `CloneableRepositoryFilterList` (modo multi). Clone igual ao item B.
- Carga: `dispatcher.refreshPublicRepositories(account, login)` →
  `API.fromAccount(account).streamPublicRepositories(login, …)`. Usar uma conta logada como
  portador do token (ou `Account.anonymous()` p/ dotcom público). Guardar num estado por
  login (separado do mapa `apiRepositories` keyed por Account) no `ApiRepositoriesStore`.

### Demanda 4 (enterprise/corporativo)
- **Já suportada** pelo app base: contas por `endpoint` (dotcom + enterprise coexistem); a aba
  Enterprise já lista/clona repos corporativos. Nada novo além de garantir que B e C funcionem
  para a conta enterprise selecionada.

## Arquivos a tocar
- `cloneable-repository-filter-list.tsx` — prop `multiSelect` + checkboxes + `selectedItems`.
- `clone-repository.tsx` — enum de abas (+PublicUser), estado por aba, render, `cloneImpl` (loop), pasta raiz.
- `clone-github-repository.tsx` — modo multi (ou novo `clone-public-user-repository.tsx`).
- `api-repositories-store.ts` — carga de repos públicos por login.
- `dispatcher.ts` + `app-store.ts` — `refreshPublicRepositories`.
- `api.ts` — ✅ feito.

## Ordem sugerida
1. Multi-seleção na lista (prop, sem regressão) + clone em lote por pasta raiz (demanda 3).
2. Aba "usuário público" (demanda 5) reusando a lista multi.
3. (Opcional) pasta individual por repo.

## Riscos
- single→multi pode regredir o fluxo atual → manter single como default via prop.
- Sem validação visual no Linux → validar por `tsc`/`eslint` e **testar no Windows**.
