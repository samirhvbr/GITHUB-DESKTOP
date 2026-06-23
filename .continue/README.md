# .continue — Diário de continuidade

Memória do projeto **entre sessões e máquinas**. Existe porque este fork é clonado
em mais de uma máquina (Windows / Linux) e o histórico local (`git reflog`) se perde
a cada clone — então o "onde paramos" precisa morar em arquivos versionados, não na
cabeça nem no reflog.

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `estado-atual.md` | Snapshot **vivo**: objetivo, ambiente, onde paramos, próximos passos. Sobrescreva ao fim de cada sessão. |
| `diario.md` | Log **append-only**: uma entrada datada por sessão, mais recente no topo. Nunca reescreve o passado. |

## Convenção

- Idioma: **pt-BR**.
- Ao **começar** uma sessão: leia `estado-atual.md` primeiro.
- Ao **terminar** uma sessão: atualize `estado-atual.md` e adicione uma entrada em `diario.md`.
- Para a continuidade sobreviver entre máquinas, **commitar + push** esta pasta na
  branch da feature (`multi-repo-dashboard`).
