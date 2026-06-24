# Fase 3 — Push agendado + auto-commit opt-in (implementado 2026-06-24)

> Demanda 6 do [SAMIR-PROJETO.md](SAMIR-PROJETO.md). Branch `multi-repo-dashboard`.
> Implementado nesta sessão; **falta validação ao vivo no Linux** (rebuild+restart)
> e observar um disparo real (intervalo mínimo 5 min).

## Objetivo

Agendar push periódico por repositório e, se o usuário optar (opt-in), fazer um
commit "padrão" das alterações pendentes antes do push. **Tudo desligado por
padrão.**

## Decisões de design

- **Off por padrão.** Auto-commit sem revisão é escolha explícita do usuário
  (mal sinalizado seria perigoso) — começa desligado e avisado na UI.
- **Por repositório**, persistido em `WorkflowPreferences.autoPush` (mesmo
  mecanismo do `forkContributionTarget`). **Sem migration**: o Dexie já salva
  `workflowPreferences` como objeto inteiro ([repositories-database.ts:62](../app/src/lib/databases/repositories-database.ts#L62)).
- **Guarda-corpos no push** (espelham o `canSyncInBatch` do dashboard): só
  empurra com `remote != null`, `tip` Valid, upstream rastreado e `ahead > 0`.
  **Nunca** force-push; nunca abre o popup `PublishRepository`.
- Cobertura de **todos os repos** (não só o selecionado): `Map<repoId,
  BackgroundPusher>` no AppStore, reconciliado quando a lista/prefs mudam.
  (O `BackgroundFetcher` original é single-instance amarrado ao repo selecionado.)

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| [models/workflow-preferences.ts](../app/src/models/workflow-preferences.ts) | `AutoPushPreferences` + `autoPush?` no tipo; `getAutoPushPreferences()` (defaults+clamp); constantes (`DefaultAutoPushIntervalMinutes=30`, `MinAutoPushIntervalMinutes=5`, `DefaultAutoCommitMessage`). |
| [lib/stores/helpers/background-pusher.ts](../app/src/lib/stores/helpers/background-pusher.ts) | NOVO. Espelha `BackgroundFetcher`: `setTimeout` auto-reagendado + skew. 1ª execução só após 1 intervalo (não dispara ao ligar). |
| [lib/stores/app-store.ts](../app/src/lib/stores/app-store.ts) | `backgroundPushers` Map + `reconcileBackgroundPushers()` (start/stop/restart por interval) chamado no `onDidUpdate` e `loadInitialState`; `autoPushRepository()` (refresh → auto-commit opcional via `_changeIncludeAllFiles`+`_commitIncludedChanges` → `_push` com guardas). |
| [ui/repository-settings/auto-push-settings.tsx](../app/src/ui/repository-settings/auto-push-settings.tsx) | NOVO. Seção: ligar, intervalo (min), auto-commit, mensagem. |
| [ui/repository-settings/repository-settings.tsx](../app/src/ui/repository-settings/repository-settings.tsx) | Nova aba `AutoPush` (antes de `ForkSettings` p/ não quebrar o mapeamento posicional do `TabBar`, já que Fork é condicional); persiste fork+autoPush num **único** `updateRepositoryWorkflowPreferences`. |
| [ui/multi-repo-dashboard/multi-repo-dashboard.tsx](../app/src/ui/multi-repo-dashboard/multi-repo-dashboard.tsx) | Toggle rápido por linha (liga/desliga com intervalo default). |
| [styles/ui/_multi-repo-dashboard.scss](../app/styles/ui/_multi-repo-dashboard.scss) | `.auto-push-toggle`. |

## Fluxo do `autoPushRepository` (app-store)

1. Pega o repo mais fresco por id (prefs/path podem ter mudado).
2. Se `!enabled` → sai.
3. `_refreshRepository` (carrega status/branch/remote).
4. Se `autoCommit` e há arquivos pendentes → `_changeIncludeAllFiles(true)` +
   `_commitIncludedChanges({summary, description:null})` → re-refresh.
5. Guardas (remote, tip Valid, `aheadBehind.ahead > 0`) → `_push`.

## Validação

- ✅ `tsc --noEmit`: limpo (só os 4 erros de baseline do `node_modules`/WeakMap).
- ⏳ `build:dev` (TS+SCSS+webpack) — rodando ao finalizar a sessão.
- ⏳ **Ao vivo no Linux:** abrir Repository Settings → aba "Push automático";
  ligar o toggle no dashboard; confirmar persistência; observar um push após o
  intervalo. Auto-commit: testar com repo de descarte primeiro.

## Pendências / próximos

- Throttle **persistido** (sobreviver a restart, estilo `lastPruneDate`) — hoje o
  agendamento é só em memória (igual ao `BackgroundFetcher`).
- "Force push em branch nova se conflito" + aviso por e-mail — itens FUTUROS do
  SAMIR-PROJETO, atrás de flag; **fora** desta leva.
- Verificar a relação com o bug "status sempre OK" antes de confiar 100% no
  `ahead > 0` como gatilho.
