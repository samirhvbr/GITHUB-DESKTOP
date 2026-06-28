# Build do macOS — assinatura & notarização (pra não ir pro lixo)

> **Pergunta do operador (2026-06-28):** "o build no Mac vou fazer no mesmo Mac
> do shvterm, ele já puxa aqueles tokens necessários pra não ir direto pra
> lixeira?"
>
> **Resposta curta: NÃO.** O `build-dist.sh` só roda `yarn package`; ele **não
> carrega credencial nenhuma** (diferente do `build-local.sh` do shvterm, que
> auto-carrega `~/.config/sshvterm/build.env`). Se as variáveis de notarização
> não estiverem no ambiente, ele **assina mas NÃO notariza — em silêncio** → no
> Mac de outra pessoa o Gatekeeper barra ("danificado / não foi possível
> verificar") = **vai pro lixo.**

## Pra amanhã — o que fazer no Mac (workaround manual de hoje)

Do jeito que o código está **hoje**, pra sair notarizado, rode na raiz do repo:

```bash
source ~/.config/sshvterm/build.env          # mesmo arquivo que o shvterm já usa
export APPLE_ID_PASSWORD="$APPLE_PASSWORD"    # ⚠️ mapear o nome (ver tabela)
./build-dist.sh
```

(supondo que `APPLE_ID` e `APPLE_TEAM_ID` já venham do `build.env` do shvterm).

Depois **confira você mesmo** que saiu notarizado (o script ainda não confere):

```bash
APP=$(find dist -maxdepth 3 -name '*.app' -type d | head -1)
spctl -a -t exec -vv "$APP"        # tem que dizer "accepted / Notarized Developer ID"
xcrun stapler validate "$APP"      # tem que dizer "The validate action worked!"
```

Se `spctl` reprovar → o app não está notarizado, **não distribua**.

## Por que funciona (e o que falta)

- `yarn build:prod` roda com **`NODE_ENV=production`** → `getChannel()` =
  `production` → `isPublishable()` = **true**
  ([dist-info.ts:110-114](../script/dist-info.ts#L110-L114)). Por isso o build é
  "de distribuição", não dev.
- **Assinatura** ([build.ts:205-217](../script/build.ts#L205-L217)):
  `type: 'distribution'`, `identity: undefined` → o `electron-osx-sign`
  **auto-descobre** a identidade **Developer ID Application** no keychain. Como é
  o **mesmo cert** que o shvterm já usa naquele Mac, a assinatura **deve
  funcionar sozinha**.
- **Notarização** ([build.ts:485-494](../script/build.ts#L485-L494)):
  `getNotarizationOptions()` lê `APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`
  **do ambiente**. Faltou alguma → retorna `undefined` → **build sem
  notarizar**. O `throw` por falta de credencial **só dispara no GitHub
  Actions**, não no build local — por isso passa batido.
- O `setup-macos-keychain` (importa cert via `APPLE_APPLICATION_CERT` base64) só
  roda **dentro do CI** (`isGitHubActions()`), não local. Local = depende do cert
  já estar no login keychain (está, por causa do shvterm).

## Mapa de nomes das variáveis (shvterm → GitHub Desktop)

| Para quê | shvterm (`build.env`) | GitHub Desktop quer | |
|---|---|---|---|
| Apple ID (email) | `APPLE_ID` | `APPLE_ID` | ✅ igual |
| Senha app-specific | `APPLE_PASSWORD` | **`APPLE_ID_PASSWORD`** | ⚠️ nome diferente |
| Team ID | `APPLE_TEAM_ID` | `APPLE_TEAM_ID` | ✅ igual |
| Cert de assinatura | keychain (Developer ID) | keychain (auto-descobre) | ✅ mesmo cert |

## Correção recomendada (pendente — decidir e implementar)

Portar o bloco de credenciais do `build-local.sh` do shvterm pro
`build-dist.sh` (e par `.ps1`/`.cmd`), de modo que ele:

1. **auto-carregue** `~/.config/sshvterm/build.env` (ou um `build.env` próprio do
   desktop) e **mapeie** `APPLE_PASSWORD → APPLE_ID_PASSWORD`;
2. **se recuse a entregar build não-notarizado** (guarda anti-ad-hoc, com flag
   `--allow-adhoc` consciente pra teste local), igual ao shvterm;
3. **verifique no fim** com `spctl -a -t exec` + `xcrun stapler validate` e
   aborte se reprovar.

Isso entra junto da decisão maior (ver [build-scripts-vs-shvterm] abaixo):
**(A)** só a trava de `git pull` antes de buildar, ou **(B)** paridade total
(trava de sync + cronômetro por etapa + flags `-ForceSync`/`-NoPull`).
Recomendação: **(B) + este bloco de credenciais do macOS**.

## ⚠️ A confirmar antes do 1º release pra fora (não trava o build local)

O **bundle id** do build de produção é `com.github.GitHubClient` (oficial do
GitHub). Pra um fork, o bundle id + o Developer ID/Team precisam **bater com a
sua conta Apple**, senão a notarização/distribuição fica ambígua. Revisar
`getBundleID()` e o ícone/identidade do fork antes de publicar.

## Estado dos scripts de build (contexto)

- **Existem e cobrem os 3 SOs:** [build-dist.ps1](../build-dist.ps1) +
  [.cmd](../build-dist.cmd) (Windows), [build-dist.sh](../build-dist.sh)
  (macOS `.dmg`/`.app` e Linux `.deb`).
- **Mas são "light" vs. o `build-local` do shvterm:** faltam (1) **git
  sync/pull antes de buildar** (a trava "não buildar versão atrasada"), (2)
  cronômetro por etapa, (3) flags `-ForceSync`/`-NoPull`, e (4) — no macOS —
  todo o bloco de credenciais/guarda acima.
- Mais relevante porque há **dois clones** do GITHUB_DESKTOP na máquina
  (`x\GITHUB_DESKTOP` em `multi-repo-dashboard` e
  `Documents\GitHub\GITHUB_DESKTOP` em `development`) — exatamente o cenário
  "buildei/empurrei a versão errada" que a trava de sync previne.
