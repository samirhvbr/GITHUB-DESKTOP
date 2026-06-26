# Fase 3b — Notificações por Telegram + conflito→branch nova

> Demanda futura do [SAMIR-PROJETO.md](SAMIR-PROJETO.md) (push agendado:
> avisar problemas; subir em branch nova se conflitar). Branch
> `multi-repo-dashboard`. Decisões do operador (2026-06-25):
> **bot global**, **2 modos de reporte**, construção **faseada (Telegram 1º)**.

## Decisões

- **Config global** (um bot/chat para todos os repos), na aba **Preferences →
  Notifications** (a aba já existe: `PreferencesTab.Notifications`).
- **Token do bot = segredo** → `TokenStore` (keytar/libsecret), **nunca** em
  localStorage/config de texto puro. `chat_id`/enabled/escopo → localStorage.
- **2 modos** (o usuário escolhe): `all` = tudo que o auto-push fizer
  (enviado / nada a enviar / sem upstream / erro / branch nova); `conflict-only`
  = só quando criar branch nova por conflito.
- **Faseado:** Fase A = infra Telegram + reportar os eventos que o auto-push
  **já** produz. Fase B = lógica conflito→branch-nova (atrás de opt-in) +
  reportar esse evento.

## Fase A — infra Telegram (esta leva)

### Arquivos

| Arquivo | Mudança |
|---------|---------|
| `app/src/models/telegram.ts` | NOVO. `TelegramNotificationScope` (`'all'`/`'conflict-only'`), `ITelegramSettings` (`enabled`, `chatId`, `scope`, `hasToken`), defaults. |
| `app/src/lib/telegram.ts` | NOVO. `sendTelegramMessage(token, chatId, text)` → POST `api.telegram.org/bot<token>/sendMessage`; retorna `{ok, error?}`. Usa `fetch`. |
| `app/src/lib/stores/app-store.ts` | Campos `telegram*`; load no estado inicial (localStorage + `TokenStore.getItem` p/ `hasToken`); `_setTelegramSettings`/`_setTelegramBotToken`/`_testTelegramMessage`; expõe `telegram` em `getState()`. Hook em `runScheduledPush` p/ enviar por escopo. |
| `app/src/lib/app-state.ts` | `readonly telegram: ITelegramSettings` em `IAppState`. |
| `app/src/ui/dispatcher/dispatcher.ts` | `setTelegramSettings`, `setTelegramBotToken`, `testTelegramMessage`. |
| `app/src/ui/preferences/notifications.tsx` | Seção "Telegram": enable, token (password), chat_id, escopo (radio), botão "Enviar teste". |
| `app/src/ui/preferences/preferences.tsx` | Passa props `telegram*` + handlers ao `<Notifications>`; estado local seedado do appState. |
| `app/src/ui/app.tsx` | Repassa `appState.telegram` ao `<Preferences>`. |

### Chave de segredo
`TokenStore.setItem('telegram', 'bot-token', token)` / `getItem` / `deleteItem`.

### Hook no `runScheduledPush` (app-store)
Após decidir o resultado (enviado / nada a enviar / sem upstream / erro), se
`telegram.enabled` e `scope === 'all'`, enviar 1 mensagem curta. `conflict-only`
não dispara nada na Fase A (só na B). Falha do Telegram **nunca** quebra o push
(try/catch + log).

### Validação
- ✅ **Implementado 2026-06-25.** `tsc --noEmit` limpo; `eslint` sem erros nos 10
  arquivos; dev-server `compiled successfully`. (AppStore roda no renderer →
  HMR/reload pega; em dúvida, fechar/reabrir via `run-local`.)
- ⏳ **Ao vivo:** criar bot no @BotFather → Preferences → Notifications → seção
  "Telegram (push agendado)": pôr token+chat, **Salvar**, **Enviar teste** →
  chega no Telegram. Depois um auto-push real / "Testar agora" (modo `all`) →
  chega o aviso. **Obs.:** modo `conflict-only` só dispara na Fase B.

### Arquivos efetivamente tocados
`models/telegram.ts` (novo), `lib/telegram.ts` (novo), `lib/stores/app-store.ts`,
`lib/app-state.ts`, `ui/dispatcher/dispatcher.ts`, `ui/preferences/notifications.tsx`,
`ui/preferences/preferences.tsx`, `ui/app.tsx`. Token via `TokenStore('telegram',
'bot-token')`; resto em localStorage `telegram-settings`.

## Fase B — conflito → branch nova (próxima leva)

- No `runScheduledPush`, se o `_push` for rejeitado por non-fast-forward
  (divergência), e o opt-in estiver ligado: criar branch
  `auto/<branch>-<YYYYMMDD-HHMM>`, push nela (sem force no default), reportar no
  Telegram (sempre, nos 2 modos). Atrás de flag/opt-in (decisão do roadmap).
- Detectar a rejeição via retorno/erro do `_push` (checar `GitError`
  `PushNotFastForward`).
