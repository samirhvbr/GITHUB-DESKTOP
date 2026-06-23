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

## Onde paramos (2026-06-23)

- ✅ Ambiente de dev: fix do `yarn start` (commit `eb88c78f78`).
- ✅ `.continue/` criada, commitada e pushada (sobrevive a re-clones).
- ✅ Investigação técnica (4 eixos) → [plano-tecnico.md](plano-tecnico.md).
- ✅ **Fase 1 (dashboard)** implementada, validada (tsc + eslint) e pushada.
- ✅ **Fase 2a:** `API.streamPublicRepositories` (repos públicos por usuário) — validada.
- 📋 **Fase 2 (UI de clone)** desenhada em [fase2-clone-design.md](fase2-clone-design.md) — pronta p/ executar.
- ⏳ Validação **visual** da Fase 1 pendente (rodar no Windows).

## Como rodar (dev)

```bash
node vendor/yarn-1.21.1.js install --ignore-engines   # Node local 20 < 22 exigido por uma dep
node vendor/yarn-1.21.1.js start
```
No Linux atual não há Node 24 nem nvm; o usuário roda o app de fato no **Windows**.
Aqui o objetivo é só editar + validar tipos (`node_modules/.bin/tsc --noEmit`).

## Branches

| Branch | Papel |
|--------|-------|
| `development` | Base; espelha o upstream `desktop/desktop`. |
| `multi-repo-dashboard` | Feature. **Branch de trabalho.** |

## Próximos passos

- [ ] **Validação visual da Fase 1** — rodar `yarn start` no Windows e conferir o dashboard.
- [ ] **Fase 2 (UI):** seguir [fase2-clone-design.md](fase2-clone-design.md) — multi-seleção +
      clone em lote por pasta raiz, depois a aba "usuário público".
- [ ] **Fase 3:** push agendado + auto-commit opt-in — ver [plano-tecnico.md](plano-tecnico.md).
