# Estado Atual

> Snapshot vivo do projeto. **Leia isto primeiro** ao retomar.
> Última atualização: **2026-06-23**.

## Projeto

Fork pessoal do **GitHub Desktop** — `git@github.com:samirhvbr/GITHUB_DESKTOP.git`.
App **Electron + TypeScript + React**. Build com **yarn** / **Node 24.15.0**.

## Objetivo da feature ✅ (confirmado 2026-06-23)

Branch de trabalho: **`multi-repo-dashboard`**.

Um **painel de status agregado**: uma tela nova que lista **todos os repositórios**
adicionados ao GitHub Desktop de uma vez, mostrando para cada um:

- branch atual;
- ahead/behind em relação ao remoto (↑ / ↓);
- nº de alterações não commitadas (working tree);
- último fetch.

Visão panorâmica de "o que precisa de atenção". Clicar num repo abre a visão normal
dele (comportamento atual). O GitHub Desktop hoje só opera um repositório por vez.

## Onde paramos (2026-06-23)

- ✅ Ambiente de dev **funcionando**: `yarn start` abre a janela do dev build.
- ✅ Config Claude Code criada (`.claude/`, perfil Opus).
- ⬜ Feature **ainda não iniciada** — nenhum código de "multi-repo dashboard" existe.
  A branch só tem **1 commit** além de `development`: o fix de build abaixo.

## Único commit da feature até agora

`eb88c78f78 — Fix dev build launch on Windows` (2026-06-23):
- `script/run.ts`: remove `ELECTRON_RUN_AS_NODE` do env do binário lançado — senão o
  Electron empacotado roda como Node puro, `app` fica `undefined` e o processo fecha
  sem abrir janela.
- `app/src/main-process/main.ts`: em dev, `userData` aponta para `GitHub Desktop-dev`
  — lock de instância próprio, roda lado a lado com o GitHub Desktop de produção.

## Como rodar (dev)

```bash
nvm use            # Node 24.15.0
yarn               # instala deps
yarn start         # abre o dev build (perfil isolado "GitHub Desktop-dev")
```

## Branches

| Branch | Papel |
|--------|-------|
| `development` | Base; espelha o upstream `desktop/desktop`. |
| `multi-repo-dashboard` | Feature. Hoje = `development` + fix de build. **Branch de trabalho.** |

## Próximos passos

- [x] ~~Confirmar a visão~~ → **painel de status agregado** (2026-06-23).
- [ ] `git checkout multi-repo-dashboard` para trabalhar na branch certa (estamos em `development`).
- [ ] Rodar `yarn start` no **Linux** e confirmar que o fix (feito no Windows) também vale aqui.
- [ ] **Investigação técnica:** mapear onde o status de cada repo é computado
      (lista de repos, `git status`, ahead/behind, último fetch). Ponto de partida
      provável: `app/src/lib/stores` (AppStore / RepositoriesStore).
- [ ] Desenhar onde o painel encaixa na UI (view nova vs. tela de "nenhum repo selecionado").
- [ ] Quebrar em tarefas e implementar.
