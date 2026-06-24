# VERSION

Versão do **fork multi-repositório** do GitHub Desktop — independente da versão
do app _upstream_ (`app/package.json`, hoje `3.5.13-beta3`), que indica em qual
release do GitHub Desktop este fork é baseado.

> Fonte de verdade no código: [`app/src/lib/fork-version.ts`](app/src/lib/fork-version.ts).
> Ao subir a versão, atualize **os dois** — a constante e este arquivo.
> A versão em execução aparece na tela inicial ("Let's get started!") e no
> diálogo **About**.

## 0.3.0 — atual

- **Select all** no clone em lote: marca/desmarca todos de uma vez, com 3 estados
  (todos / alguns / nenhum) e respeitando o filtro de busca.
- Polimentos do clone em lote:
  - o scroll não volta mais ao topo a cada seleção;
  - lista mais leve (item virou `PureComponent` + `matches` referencialmente
    estável na `SectionFilterList`);
  - repositórios que já existem na pasta são **pulados** com aviso (banner), em
    vez do popup de erro "destination already exists / Retry clone".

## 0.2.0 — Clone seletivo (Fase 2)

- `API.streamPublicRepositories` — lista repos públicos de um usuário arbitrário.
- Clone em lote: multi-seleção por checkbox + botão "Clone N repositories" numa
  pasta raiz comum (uma subpasta por repo), no branch default.

## 0.1.0 — Painel multi-repo (Fase 1)

- Tela que lista todos os repositórios e destaca os que têm demanda (commit
  pendente / atrás do remoto), reusando `localRepositoryStateLookup` +
  `RepositoryIndicatorUpdater`.
