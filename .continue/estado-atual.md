# Estado Atual

> Snapshot vivo do projeto. **Leia isto primeiro** ao retomar.
> Última atualização: **2026-06-23**.

## Projeto

Fork pessoal do **GitHub Desktop** (`3.5.13-beta3`) — `git@github.com:samirhvbr/GITHUB_DESKTOP.git`.
App **Electron + TypeScript + React**. Build com **yarn** vendorizado (`vendor/yarn-1.21.1.js`).
⚠️ Node: o projeto pede **24.15.0** (`.nvmrc`); uma dep (`process-proxy`) exige **≥22**.

## Objetivo

Transformar o GitHub Desktop num gerenciador **multi-repositório**. Demandas completas em
[SAMIR-PROJETO.md](SAMIR-PROJETO.md); plano de execução com ponteiros de código em
[plano-tecnico.md](plano-tecnico.md). Resumo:

1. Listar todos os repos num painel.
2. Destacar repos com demanda (commit pendente / atrás do remoto → precisa pull).
3. Login + clone seletivo (escolher repos e pasta raiz ou individual).
4. Clone de enterprise/corporativo + do usuário.
5. Clone de repos públicos por nome de usuário.
6. Agendar push automático + commit "padrão" opt-in.
- Futura: login centralizador remoto (estilo sshvterm).

## Versão do fork

**v0.4.0** (`app/src/lib/fork-version.ts`; changelog em [VERSION.md](../VERSION.md)).
Aparece na tela "Let's get started!" e no diálogo **About**. Independente da
versão upstream (`app/package.json` = `3.5.13-beta3`).

## Onde paramos (2026-06-23, cont. 5)

- ✅ **Pull/Push em lote + status agregado + relatório** no Painel de repositórios
  (v0.4.0): seleção, **até 3 simultâneos**, **auto-refresh ao abrir**, botão **Atualizar**,
  tela **Status** (relatório por categoria + última ação + "Copiar"), zebra + X em erro.
  Validado no Windows.
- ✅ **Multiplataforma:** scripts `run-local.sh` + `build-dist.{sh,ps1,cmd}` + guia
  [run-mac-linux.md](run-mac-linux.md). Dev roda nos 3; instalador Linux `.deb`
  (`packageLinux()` em `script/package.ts`) escrito — a validar no Debian.
- ✅ Ambiente de dev rodando no Windows (Node 24, yarn vendorizado; `run-local`).
- ✅ **Fase 1 (dashboard)** + **Fase 2b (clone em lote)** validadas no app.
- ✅ **Polimentos do clone em lote** (testados): (1) scroll não volta mais ao topo
  ao marcar; (2) lista mais leve (`PureComponent` + `matches` estável); (3) repos
  já existentes são **pulados com banner**, não popup de erro.
- ✅ **Select all** (tri-state, respeita filtro) no clone em lote — validado.
- ✅ **Versionamento** do fork (VERSION.md + visível na UI) — validado.
- 📋 **Fase 2 (UI de clone restante)** em [fase2-clone-design.md](fase2-clone-design.md):
  aba "usuário público" + pasta individual por repo — ainda pendente.

## Como rodar (dev)

```bash
node vendor/yarn-1.21.1.js install --ignore-engines   # Node local 20 < 22 exigido por uma dep
node vendor/yarn-1.21.1.js start
```
No Linux atual não há Node 24 nem nvm; o app roda de fato no **Windows** — guia completo em
[run-windows.md](run-windows.md). Aqui o objetivo é só editar + validar tipos (`node_modules/.bin/tsc --noEmit`).

## Branches

| Branch | Papel |
|--------|-------|
| `development` | Base; espelha o upstream `desktop/desktop`. |
| `multi-repo-dashboard` | Feature. **Branch de trabalho.** |

## Próximos passos

> Todo o `.continue` segue no roadmap, mas a **prioridade atual** é o item de ações em lote.

- [x] **Pull/Push em lote + status agregado + relatório** no dashboard — feito e
      validado no Windows (v0.4.0): seleção, até 3 simultâneos, auto-refresh, tela de
      relatório com "Copiar".
- [ ] **Validar no Mac e no Linux** com `run-local.sh` (código portável; só falta rodar lá).
- [~] **Instalador Linux (`.deb`):** `packageLinux()` escrito em `script/package.ts`
      (electron-installer-debian) — **validar no Debian Trixie** (`./build-dist.sh`).
- [x] Polimentos do clone em lote (scroll, leveza, pular existentes) — feito.
- [x] **Select all** no clone em lote — feito.
- [x] Versionamento do fork (VERSION.md + UI) — feito (v0.3.0).
- [ ] **Fase 2c:** ajuste individual de pasta por repo + aba "usuário público" (`streamPublicRepositories`).
- [ ] **Fase 3:** push agendado + auto-commit opt-in — ver [plano-tecnico.md](plano-tecnico.md).
- [~] **Multiplataforma** (SAMIR-PROJETO): código é portável; **Windows validado**.
      Launcher `run-local.sh` (Mac/Linux) + guia [run-mac-linux.md](run-mac-linux.md)
      criados. **Falta buildar/rodar no Mac e no Linux.** Empacotamento de produção:
      macOS/Windows ✅; **Linux `.deb`** via `packageLinux()` (escrito, a validar no Debian).
