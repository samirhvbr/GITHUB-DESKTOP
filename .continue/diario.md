# Diário de bordo

Log append-only. Uma entrada por sessão, mais recente no topo.

---

## 2026-06-28 — Validação ao vivo: auto-push OK, bug dos 2 clones, doc do build macOS

- **App rodado ao vivo no Windows** (`build:dev` + `yarn start`, janela "GitHub
  Desktop-dev" no ar). Montado harness seguro em `C:\Users\Samir\autopush-test`
  (remote **bare** local + clone `work` ahead, sem GitHub, zero risco) pra testar
  push/auto-commit.
- **Push agendado (Fase 3): lógica CORRETA.** Revisão de código:
  `_commitIncludedChanges` retorna boolean ✓, guardas (remote/tip/ahead>0) ✓,
  nunca force ✓, `_push` empurra o branch inteiro ✓. O "Testar agora"
  (`_runScheduledPushNow`) roda o fluxo na hora, sem esperar o timer.
- **🔑 Bug-raiz descoberto: há DOIS clones do GITHUB_DESKTOP.** O **app observa**
  `C:\Users\Samir\Documents\GitHub\GITHUB_DESKTOP` (clone em lote, branch
  `development`, **0 ahead**); o operador **commita** em
  `C:\Users\Samir\x\GITHUB_DESKTOP` (`multi-repo-dashboard`, ahead). Por isso o
  "Testar agora" no GITHUB_DESKTOP deu **"nada a enviar (0 à frente)"** e o status
  parece "sempre OK". **Não é bug do auto-push** — é confusão de clone. Explica
  também a queixa antiga *"mudo arquivo e status fica OK"* e *"push do app não
  subiu meus commits"* (operador empurra num clone, app vigia o outro).
- **Telegram (Fase 3b-A):** infra pronta; **teste ao vivo pendente** — falta
  criar bot no @BotFather + descobrir chat_id. Combinado: escopo **"all"**,
  "Enviar teste" → "Testar agora" no repo `work` (espera "work: N commit(s)
  enviado(s)"). `conflict-only` só dispara na Fase B (não existe ainda).
- **Build macOS documentado** em [MACOS_BUILD.md](MACOS_BUILD.md): `build-dist.sh`
  **não puxa tokens** (≠ shvterm); assina (Developer ID do keychain) mas **não
  notariza** sem `APPLE_ID`/`APPLE_ID_PASSWORD`/`APPLE_TEAM_ID` no ambiente →
  vai pro lixo no Mac alheio. Nome `APPLE_PASSWORD`→**`APPLE_ID_PASSWORD`** difere
  do shvterm.
- **Pendências:** (1) testar Telegram ao vivo; (2) ver o push agendado empurrar de
  verdade no repo `work`; (3) portar pros `build-dist` a trava de **git-sync antes
  de buildar** + o **bloco de credenciais/guarda macOS** do shvterm (decisão A/B
  em aberto — recomendado **B + credenciais mac**).
- ⚠️ **Operacional:** o desktop está apontado pro clone de `Documents\GitHub`
  (`development`). Pra um push pelo desktop incluir o trabalho de
  `x\GITHUB_DESKTOP`, **apontar o app pra esta pasta** (senão empurra o clone
  errado — o tal bug).

---

## 2026-06-25 (cont.) — Fase 3b-A: notificações por Telegram (infra)

- **Decisões do operador:** bot **global** (1 token p/ todos), **2 modos** de
  reporte (tudo / só branch-nova-por-conflito), construção **faseada** (Telegram
  primeiro, conflito→branch-nova depois). Design em
  [fase3b-telegram.md](fase3b-telegram.md).
- **Fase A implementada:** token do bot no `TokenStore` (cofre seguro, keytar) —
  nunca em texto puro; `enabled`/`chatId`/`scope` em localStorage. Cliente
  `lib/telegram.ts` (`sendMessage`, nunca lança). Seção "Telegram" na aba
  **Preferences → Notifications** (token, chat id, escopo, **Salvar** + **Enviar
  teste**). `runScheduledPush` virou wrapper que reporta o desfecho ao Telegram
  por escopo (`computeScheduledPushOutcome` faz o trabalho e devolve
  `{message, isConflictBranch}`). Falha do Telegram **nunca** quebra o push.
- 10 arquivos (2 novos): `models/telegram.ts`, `lib/telegram.ts`,
  `app-store.ts`, `app-state.ts`, `dispatcher.ts`, `notifications.tsx`,
  `preferences.tsx`, `app.tsx`.
- **Validação:** `tsc` + `eslint` limpos; dev-server `compiled successfully`.
  Ao vivo pendente (ver doc). **Modo `conflict-only` não dispara até a Fase B.**
- **Fase B (próxima):** detectar push rejeitado (non-fast-forward) → criar
  `auto/<branch>-<datahora>`, push nela, reportar (atrás de opt-in).

---

## 2026-06-25 — Bug do PULL em lote ("git_pull.sh pegava o que o desktop não pegava")

- **Contexto recuperado pós-crash do VSCode** via `.continue/` (sessão anterior não
  deixou nada no working tree — tudo já estava commitado no HEAD `0.1.0 - Docs`).
- **Sintoma (operador):** rodar o pull em lote no dashboard reportava vários repos como
  "já atualizado", mas o `~/x/git/git_pull.sh` (que faz `git pull --ff-only`, ou seja,
  **fetch** + ff) trazia material novo nesses mesmos repos.
- **Causa-raiz confirmada no código:** o pull em lote decidia pular com
  `ab.behind === 0`, e esse `behind` vinha do `git status` **local** — medido contra o
  ref de rastreamento `origin/<branch>` da **última vez que se fez fetch**. O
  `dispatcher.refreshRepository` (linha ~637) só faz `loadStatus`/`loadBranches`,
  **não faz fetch**. Repo com commits novos no remoto, mas sem fetch recente →
  `behind === 0` → pulado como "já atualizado". O `git pull` manual fazia fetch e por
  isso enxergava. (Push **não** tem esse bug: `ahead` de commits locais é confiável sem
  fetch.)
- **Fix** ([multi-repo-dashboard.tsx](../app/src/ui/multi-repo-dashboard/multi-repo-dashboard.tsx)
  `runBatch`, ramo `pull`): antes de checar `behind`, faz
  `dispatcher.fetch(repo, FetchType.UserInitiatedTask)` → `refreshRepository` →
  relê `aheadBehind` do lookup (agora medido contra o ref recém-buscado) → só então
  decide "já atualizado" vs. `pull`. `let before/ab` para reler. Import de `FetchType`.
- **Validação:** `tsc --noEmit` limpo; `eslint` sem regressão (os 3 `jsx-no-bind` do
  arquivo já existiam no HEAD, em código de render alheio). **✅ Validado ao vivo
  (2026-06-25)** no Linux (Node 24, `run-local.sh --skip-install --skip-build`):
  ALLinONE estava 8 commits atrás (`git log HEAD..@{u}` = 8) → Pull em lote no dashboard
  → depois `HEAD..@{u}` vazio (em dia). O log do app confirma a sequência da correção
  (`Executing fetch` → `Executing pull --ff` → `getAheadBehind`) e o lote puxou 9+ repos,
  a maioria sem fetch manual prévio.
- **Aberto/relacionado:** o **display** das linhas (open/Atualizar via
  `refreshIndicatorForRepository`) ainda só faz fetch quando `shouldBackgroundFetch`
  libera (throttle) — pode mostrar "Atualizado" enganoso até o próximo fetch. O **pull**
  agora está correto de qualquer forma; o display é follow-up menor.

---

## 2026-06-23 (cont. 5) — Pull/Push em lote + status/relatório + multiplataforma (v0.4.0)

- **PRIORIDADE entregue:** ações em lote no **Painel de repositórios** (estende a Fase 1).
  - **Pull/Push em lote** nos selecionados (checkbox + "Selecionar todos" tri-state),
    **até 3 simultâneos** (`p-limit`, padrão do `ahead-behind-store`); feedback por repo
    (spinner → ✓/✗ com tooltip) e `dispatcher.refreshRepositoryIndicator(repo)` após cada um.
  - Filtro `canSyncInBatch = aheadBehind !== null` (sem upstream → pulado, evita o popup
    "Publish repository" em massa).
  - **Auto-refresh ao abrir** o painel (`componentDidMount` → refresh de todos, até 6;
    `loadStatus` é local/rápido) — **resolveu** o "Sem upstream (25)" enganoso (o lookup
    começa vazio a cada start). **Validado no app.** Botão **Atualizar** também.
  - **Tela de relatório** (botão "Status"): categorias (commitar/atrás/à frente/sem
    upstream/atualizados) + última ação em lote + **Copiar relatório** (texto). **Validado.**
  - **Zebra** (`:nth-child(even)` com `--box-alt-background-color`), **X** em erro
    (`octicons.x`) e `log.error` no catch (loga em `userData/logs`).
  - Nova infra: `app-store._refreshRepositoryIndicator` + `dispatcher.refreshRepositoryIndicator`.
    Dashboard recebe `dispatcher` (app.tsx).
- **Multiplataforma:** `run-local.sh` (dev Mac/Linux), `build-dist.sh`/`.ps1`/`.cmd`
  (produção), `.gitattributes` força `*.sh eol=lf`, guia `run-mac-linux.md`. **Achado:**
  `script/package.ts` só empacota `darwin`/`win32` → instalador Linux é trabalho futuro
  (dev build + run roda nos 3). **Validado só no Windows ainda.**
- **Versão do fork → 0.4.0.** Reload da UI (Ctrl+Alt+R) não funciona nesta build;
  fechar/reabrir (`run-local`) é o caminho — fechamentos do operador são intencionais, não crash.
- **Empacotamento Linux (`.deb`) escrito** (não validado): `packageLinux()` em
  `script/package.ts` via `electron-installer-debian` (require lazy → tsc não quebra no
  Windows sem a dep); devDep adicionada; `build-dist.sh` agora roda `yarn package` no Linux;
  ícone PNG opcional. **Validar amanhã no Debian Trixie do escritório.** Próximo: **Fase 3
  (push agendado + auto-commit opt-in).**

---

## 2026-06-23 (cont. 4) — Polimentos + Select all + versionamento (tudo testado no app)

- **App rodando no Windows** (Node 24.16, yarn vendorizado). Validado de ponta a ponta.
- **Polimentos do clone em lote** (feedback do teste anterior), todos com tsc+eslint limpos:
  1. **Scroll não volta mais ao topo** ao marcar — causa: em modo multi o `selectedItem`
     ficava `null` e o `selectedRow` interno da `SectionFilterList` era zerado a cada
     re-render. Fix: `onToggleRepository` agora também marca o repo clicado como linha
     ativa (`selectedItem`); `rootPath = path` direto. **Validado no app.**
  2. **Mais leve:** `CloneableRepositoryListItem` virou `PureComponent` + `matches`
     referencialmente estável (`emptyMatches`) na `SectionFilterList`.
  3. **Pular existentes:** `cloneSelectedRepositories` async valida cada destino com
     `validateEmptyFolder`; existentes são pulados e avisados via **banner** novo
     (`BannerType.BatchCloneSkippedExisting`, reusa `SuccessBanner`), sem o popup de erro.
- **Select all** (tri-state On/Off/Mixed, respeita o filtro de busca) no clone em lote —
  novo `onSetRepositoriesSelected` + `getVisibleRepositoryUrls` (mesma fuzzy `match` da lista).
  **Validado no app: "funcionou perfeitamente".**
- **Versionamento do fork:** `VERSION.md` (raiz) + `app/src/lib/fork-version.ts`
  (`ForkVersion=0.3.0`, `ForkName=Multi-Repo`). Exibido na tela "Let's get started!" e no
  **About** ("Multi-Repo fork v0.3.0"). **Validado no About.**
- **Gotcha:** `Ctrl+Alt+R` (reload da UI) não funcionou nesta build; `Ctrl+R` faz reload
  total e **encerra** o dev. Caminho confiável: fechar e reabrir (`run-local`/`yarn start`).
- **Próximo (PRIORIDADE do operador):** **Pull/Push em lote + status agregado** dos repos
  selecionados/todos no dashboard (quem falta commitar / está atrás do remoto).

---

## 2026-06-23 (cont. 3) — Clone em lote TESTADO e funcionando na VM

- ✅ **Clone em lote validado na VM Windows**: marcar vários repos (clique na linha) +
  "Clone N repositories" → baixou todos em `Documents\GitHub` (AREA81, BLUE3-INTRANET,
  IA-MODELFILES), cada um na subpasta, no branch default. Multi-seleção por clique OK
  após o fix do toggle (`ef2de17d93`).
- **Ajustes pedidos no teste (a fazer):**
  1. **Scroll volta ao topo a cada seleção** — o `List` (filter-list/list.tsx) re-ancora o
     scroll ao clicar (selectedRow controlado por props.selectedItem). Investigado: o clique
     no item dispara onRowClick e o estado de seleção interno briga com o single suprimido.
  2. **"Pesado"** — em parte o **DevTools** aberto (axe) em dev; em parte re-render do item
     (tornar `CloneableRepositoryListItem` PureComponent).
  3. **Repo já existente** → popup de erro "destination path already exists / Retry clone".
     Operador quer **pular + avisar** ("já existe, pulando"), não o erro.
- **Novo requisito** (SAMIR-PROJETO): **multiplataforma** — Windows, macOS e Linux (Gnome /
  Debian Trixie). Considerar ao mexer em paths/UI.

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
