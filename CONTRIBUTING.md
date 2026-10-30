# Como contribuir

1. Leia `README.md` e `docs/` (principalmente `DECISIONS.md`, `FLOW_FORMAT.md` e `SECURITY_RELIABILITY.md`).
2. Node 22+. Instale com `npm ci`.
3. Antes de abrir um PR: `npm run format:check`, `npm run lint`, `npm run typecheck` e `npm test`.
4. Mudou o schema (`packages/contracts/src`)? Rode `npm run schema` e inclua `schema/flow-bot-v0.schema.json`.

## Regras do projeto

- O runtime **nunca** importa SDK de modelo de linguagem nem chama IA (D-001).
- Nada de `eval`, `new Function`, shell ou SQL vindos de configuração.
- Conectores de canal (WhatsApp etc.) ficam em adapters, nunca no núcleo.
- Dependências com versão exata e licença revisada (`docs/DEPENDENCIES.md`).
- Código de terceiros só com licença compatível e aviso de copyright preservado; não copiar código, textos ou marca
  do app de referência nem de projetos FSL/GPL.
- Commits pequenos, com testes do comportamento alterado.
