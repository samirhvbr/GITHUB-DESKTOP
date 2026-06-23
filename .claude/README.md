# Configuração Claude Code — GitHub Desktop

Config do projeto (fork `samirhvbr/GITHUB_DESKTOP`). Stack: **TypeScript / Electron**, build com **yarn** (Node 24).

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `settings.json` | Perfil **ativo** (versionado). Hoje = Opus-only. |
| `settings.local.json` | Override local (gitignored). Acumula `allow` por sessão e **tem precedência** sobre o `settings.json`. |
| `json-opus` | Template stand-by — Opus-only (cópia do ativo). |
| `json-fable5-opus` | Template stand-by — Fable 5 + fallback Opus. |
| `json-fable5-opus-sonnet` | Template stand-by — Fable 5 + fallback Opus → Sonnet. |

**Trocar de perfil:** copie o template por cima do ativo e reinicie o Claude Code.

```bash
cp json-fable5-opus settings.json   # ex.: passa a usar Fable 5
```

## Modelo (todos os perfis)

- **Effort `max` via env** `CLAUDE_CODE_EFFORT_LEVEL` — o campo `effortLevel` do JSON só aceita `low/medium/high/xhigh`, então `max` por lá é ignorado.
- **1M nativo** no Opus 4.8 e no Fable 5 (API Anthropic), sem flag.
- Opus: adaptive thinking OFF. Fable 5: thinking sempre adaptativo (o flag não tem efeito).
- **Fable 5 / créditos:** incluso no Max até ~22/jun/2026; depois consome créditos (~2× o Opus). Requer Claude Code v2.1.170+.

## Permissões (mesmo bloco em todos os perfis)

- `defaultMode: plan`.
- **deny:** `rm -rf`, `git push --force/-f`, `git reset --hard`, `git clean -fd`, `curl|sh`/`wget|sh`, leitura de `.env*` e `*.pem`.
- **ask (confirma):** `sudo`, `git push`, `yarn add/remove/upgrade`, `yarn clean-slate`, `yarn rebuild-hard`.
- **allow:** read/edit/write, git read-only + `add`/`commit`, `yarn install/lint/prettier/markdownlint/test/compile/build/start/cli`, validações (`validate-changelog`, `validate-electron-version`, `validate-macos-version`), `node -c`, `npx tsc`.
