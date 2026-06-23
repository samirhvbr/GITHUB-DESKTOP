# Plano Técnico — Multi-Repo Dashboard

> Resultado da investigação do código em **2026-06-23**. Mapeia cada demanda do
> [SAMIR-PROJETO.md](SAMIR-PROJETO.md) aos pontos de extensão no GitHub Desktop.
> Referências no formato `arquivo:linha`. App base: `3.5.13-beta3`.

---

## Descoberta-chave: a infra multi-repo já existe

O GitHub Desktop **já mantém status agregado de TODOS os repos** (não só o selecionado):

- `IAppState.localRepositoryStateLookup: Map<number, ILocalRepositoryState>` —
  `{ aheadBehind, changedFilesCount }` por `repo.id` — `app/src/lib/app-state.ts:104`.
- `ILocalRepositoryState` — `app/src/models/repository.ts:138` (falta só `lastFetched`).
- `RepositoryIndicatorUpdater` itera todos os repos a cada **15 min** populando o lookup
  via `refreshIndicatorForRepository` — `app/src/lib/stores/app-store.ts:4023`.
- O ahead/behind vs upstream **vem de graça** no mesmo `git status --porcelain=2 --branch`
  (`status.branchAheadBehind`) — `app/src/lib/git/status.ts:375`. Sem processo git extra.
- Os indicadores (seta ahead/behind + bolinha de "uncommitted") já são renderizados por
  repo em `repository-list-item.tsx:120` (`renderRepoIndicators`).

→ **Demandas 1 e 2 são, em boa parte, consumir essa infra numa tela nova.**

---

## Fase 1 — Dashboard (demandas 1 e 2)  ← EM EXECUÇÃO

**Objetivo:** uma tela que lista todos os repositórios e destaca os que têm demanda:
precisam de commit (`changedFilesCount > 0`) ou estão atrás do remoto / precisam pull
(`aheadBehind.behind > 0`). Mostrar também ahead, branch e (1.1) último fetch.

**Arquivos a tocar:**
- NOVO `app/src/ui/multi-repo-dashboard/multi-repo-dashboard.tsx` — `UiView` que recebe
  `repositories`, `localRepositoryStateLookup`, `dispatcher`; itera os repos e renderiza
  linhas com indicadores; clique → `dispatcher.selectRepository(repo)`.
- NOVO `app/styles/ui/_multi-repo-dashboard.scss` (+ `@import` no índice de estilos).
- `app/src/lib/app-state.ts` — novo campo `showMultiRepoDashboard: boolean` no `IAppState`.
- `app/src/lib/stores/app-store.ts` — campo privado + expor em `getState()` + método
  `_setMultiRepoDashboardVisible(show)` (set + `emitUpdate()`).
- `app/src/ui/dispatcher/dispatcher.ts` — `showMultiRepoDashboard()` / `closeMultiRepoDashboard()`.
- `app/src/ui/app.tsx` — em `renderRepository()` (`:3763`), 1º check:
  `if (this.state.showMultiRepoDashboard) return <MultiRepoDashboard/>`; e um ponto de
  entrada (botão na toolbar perto de `renderRepositoryToolbarButton` `:3377`).

**Fase 1.1 (lastFetched por repo):** adicionar `lastFetched: Date|null` a
`ILocalRepositoryState` (`repository.ts:138`) e popular em `updateSidebarIndicator`
(`app-store.ts:3999`, já tem `gitStore` em escopo → `gitStore.lastFetched`).

**Como iterar os repos (na UI):**
```ts
for (const repo of this.props.repositories) {
  if (!(repo instanceof Repository)) continue       // ignora CloningRepository
  const s = this.props.localRepositoryStateLookup.get(repo.id)
  const precisaCommit = (s?.changedFilesCount ?? 0) > 0
  const precisaPull   = (s?.aheadBehind?.behind ?? 0) > 0
}
```

**Riscos:** (a) o lookup só tem repos já refreshados — tratar ausência como "desconhecido";
(b) ao abrir o dashboard, forçar um refresh (avaliar expor `refreshAllIndicators` no
dispatcher); (c) largura/altura: usar `UiView` para ocupar a área principal.

---

## Fase 2 — Clone seletivo (demandas 3, 4, 5)

**Objetivo:** logar, listar repos (conta + enterprise + públicos de um usuário arbitrário)
e clonar VÁRIOS de uma vez, escolhendo pasta raiz comum (subpasta por repo) ou pasta individual.

**Já existe e será reusado:**
- Login dotcom + enterprise: `SignInStore` (`sign-in-store.ts:156`), contas por `endpoint`
  (`models/account.ts:104/111`), tokens no keytar (`accounts-store.ts:99`). **Cobre demanda 4.**
- Repos do usuário autenticado: `API.streamUserRepositories` (`api.ts:1036`, `user/repos`).
- Clone unitário: `dispatcher.clone(url, path, {defaultBranch})` (`dispatcher.ts:832`) →
  `_clone` (`app-store.ts:5498`) → `cloning-repositories-store.ts:20` → `git/clone.ts:27`.
  Já suporta **vários clones concorrentes** (cada um vira `CloningRepository`).

**A construir:**
- **Repos públicos de usuário arbitrário (demanda 5):** NÃO existe. Adicionar
  `API.streamPublicRepositories(login, ...)` espelhando `streamUserRepositories`, com path
  `users/${login}/repos` + `fetchAll` (`api.ts:1772`). Validar login via `fetchUser` (`api.ts:2075`).
- **Multi-seleção:** `cloneable-repository-filter-list.tsx:118` hoje é single
  (`selectedItem`); virar `Set<clone_url>` (checkbox por item).
- **Clone em lote + modo de pasta:** em `clone-repository.tsx` `cloneImpl` (`:793`), trocar
  a chamada única por loop: destino = `Path.join(rootDir, repo.name)`. Validar cada pasta
  com `validateEmptyFolder` (`:682`). Opcional `dispatcher.cloneMany(items, {root})`.
- **UI:** nova aba/seção "Usuário público" (TextBox de login + buscar) reusando a MESMA
  `CloneableRepositoryFilterList`.

**Arquivos:** `api.ts`, `api-repositories-store.ts`, `dispatcher.ts`, `app-store.ts`,
`clone-repository.tsx`, `clone-github-repository.tsx`, `cloneable-repository-filter-list.tsx`.
Nada abaixo de `git/clone.ts` muda.

---

## Fase 3 — Push agendado + auto-commit opt-in (demanda 6)

**Objetivo:** agendar push periódico por repo e, se o usuário optar (opt-in), fazer um
commit "padrão" quando houver arquivos pendentes antes do push.

**Reuso:**
- Push programático: `_push(repo)` (`app-store.ts:4983`) — cuida de auth, upstream, fetch,
  refresh. **Checar `state.remote !== null` e `tip` válido antes** (senão `performPush`
  `:5019` abre popup `PublishRepository`).
- Commit programático: `_commitIncludedChanges(repo, {summary, description:null})`
  (`app-store.ts:3599`) — respeita `skipCommitHooks/signOff/allowEmpty` do estado.
- Pendências: ler `state.changesState.workingDirectory.files` com `selection !== None`.

**A construir:**
- NOVO `app/src/lib/stores/helpers/background-pusher.ts` espelhando `BackgroundFetcher`
  (`background-fetcher.ts:26`): `setTimeout` recursivo auto-reagendado + `skewInterval`.
  Throttle por timestamp persistido (copiar de `BranchPruner` + `getLastPruneDate`).
- **Decisão de design:** para TODOS os repos (não só o selecionado), usar
  `Map<repoId, BackgroundPusher>` em vez do single-instance do BackgroundFetcher.
- **Config opt-in por repo (persistência):** estender `IDatabaseRepository`
  (`repositories-database.ts:49`) com `autoPushPreferences?: {enabled, intervalMinutes,
  autoCommit, commitMessage}`, espelhando `updateRepositoryWorkflowPreferences`
  (`repositories-store.ts:342`). Timestamp de throttle: padrão `lastPruneDate`.
- UI de configuração por repo (ex.: no menu do repositório / diálogo de preferências).

**Cuidado:** auto-commit "padrão" é explicitamente uma escolha do usuário (não é boa
prática geral) — deve ser **desligado por padrão** e bem sinalizado na UI.

---

## Fase Futura — Login centralizador remoto

Controlar um GitHub Desktop remoto a partir de outro (mesma conta), p.ex. disparar um push
esquecido. Estilo do projeto **sshvterm**. Exige arquitetura nova (canal/servidor de
controle remoto, autenticação, pareamento de instâncias) — fora do escopo das fases 1–3.
Pré-requisito útil já mapeado: o modelo de contas/tokens (`accounts-store.ts`) e o push
programático (`_push`). Detalhar quando as fases 1–3 estiverem entregues.

---

## Ordem de execução

1. **Fase 1** (dashboard) — maior valor, menor risco (infra já existe). ← agora
2. **Fase 2** (clone seletivo) — independente da Fase 1.
3. **Fase 3** (push agendado) — depende de validação cuidadosa (opera git sem UI).
4. **Futura** (centralizador remoto).
