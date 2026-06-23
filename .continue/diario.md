# Diário de bordo

Log append-only. Uma entrada por sessão, mais recente no topo.

---

## 2026-06-23 (cont. 2) — App rodando na VM + Fase 2b (clone em lote)

- **App validado na VM Windows** via `run-local.cmd` (gotchas resolvidos: Node 24 por
  nvm + shell admin; encoding ASCII do .ps1; `#` não é comentário no cmd). Login OK,
  todos os repos da conta aparecem.
- **Dor do operador:** clonar ~60 repos = 60 ciclos de diálogo (inviável). Quer marcar
  vários e clonar todos de uma vez na pasta padrão, no branch default.
- **Fase 2b implementada** (tsc + eslint limpos):
  - `cloneable-repository-filter-list.tsx`: checkbox por repo (modo multi via prop opcional;
    single segue default — sem regressão). Sub-componente `CloneableRepositoryListItem`.
  - `clone-github-repository.tsx`: repassa a seleção; rótulo do campo vira "Root folder".
  - `clone-repository.tsx`: `selectedUrls` por aba; footer "Clone N repositories";
    `cloneSelectedRepositories` faz loop `dispatcher.clone(clone_url, root/name, {defaultBranch})`
    e fecha o diálogo **uma vez** só. Pasta raiz robusta (strip do repoName se há single-select);
    persiste via `setDefaultDir`.
- **Pendente:** testar na VM (começar com 2-3 repos). Depois Fase 2c (ajuste individual de
  pasta por repo + aba "usuário público" com `streamPublicRepositories`).

---

## 2026-06-23 (cont.) — Fase 2a (API) + design da UI de clone

- **Fase 2a:** `API.streamPublicRepositories(login, …)` em `app/src/lib/api.ts` — lista repos
  públicos de um usuário arbitrário (`users/{login}/repos`), espelhando `streamUserRepositories`.
  Validado (tsc + eslint).
- **Decisão:** a UI de clone (multi-seleção + clone em lote + aba "usuário público") é uma
  refatoração grande de componente central (`clone-repository.tsx` tem `selectedItem` single
  por aba) e **não dá p/ validar visualmente no Linux**. Em vez de despejar UI não-validável
  numa sessão já longa, escrevi o design de implementação em `fase2-clone-design.md` para a
  próxima sessão executar rápido e com segurança.
- Snapshot `README_20260623.md` atualizado p/ o estado de fim do dia.

---

## 2026-06-23 — Demandas mapeadas + Fase 1 (dashboard) implementada

- **Demandas** detalhadas pelo operador em `SAMIR-PROJETO.md` (6 + 1 futura).
- **Investigação técnica** com 4 agentes paralelos → sintetizada em `plano-tecnico.md`.
  Descoberta-chave: a infra de status multi-repo (`localRepositoryStateLookup` +
  `RepositoryIndicatorUpdater`) **já existe**; a Fase 1 consome isso numa tela nova.
- **Fase 1 — Painel multi-repo** implementada e validada (`tsc` + `eslint` limpos):
  - NOVO `app/src/ui/multi-repo-dashboard/multi-repo-dashboard.tsx` — `UiView` que lista
    todos os repos, com os que têm demanda (commit pendente / atrás do remoto) no topo,
    indicadores (alterações + ahead/behind) e clique para abrir.
  - Estado `showMultiRepoDashboard` (IAppState) + `AppStore._setMultiRepoDashboardVisible`
    + `Dispatcher.setMultiRepoDashboardVisible`.
  - Render em `app.tsx renderRepository()`; entrada = botão no foldout da lista de repos.
  - CSS `app/styles/ui/_multi-repo-dashboard.scss`.
- **Ambiente:** Node 20 local (projeto pede 24); deps via `yarn --ignore-engines`. O `tsc`
  da raiz acusa 4 erros de baseline em `node_modules` (WeakMap, lodash/ts) — alheios ao
  código. **Validação visual ainda pendente** (rodar no Windows / `yarn start`).
- **Pendente:** Fases 2 (clone seletivo) e 3 (push agendado) — detalhadas em `plano-tecnico.md`.

---

## 2026-06-23 — Retomada / criação do `.continue`

- Retomado o projeto após **clone novo no Linux** (o reflog só tinha o `clone`, por
  isso o contexto local se perdeu).
- Arqueologia do estado:
  - Fork do GitHub Desktop; branch de feature `multi-repo-dashboard` existe em `origin`.
  - Feature **ainda não iniciada** — só existe o commit de fix de build (`eb88c78f78`),
    feito na noite anterior no Windows.
  - Working tree limpo, exceto a config `.claude/` + um ajuste no `.gitignore`.
- Criada esta pasta `.continue/` para preservar o "onde paramos" entre máquinas.
- ✅ **Visão confirmada:** painel de **status agregado** — uma tela que lista todos os
  repos com branch, ahead/behind, nº de alterações não commitadas e último fetch.
