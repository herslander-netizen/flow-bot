# Flow Bot

**Motor de automação conversacional determinístico, configurado com assistência de IA e executado sem IA.**

O Flow Bot é um projeto independente. Sua primeira versão deve ser desenvolvida em repositório público próprio, separado do SaaS Flow. Uma integração com o Flow poderá ser considerada futuramente, por API/webhooks e contratos estáveis, mas não faz parte do escopo inicial.

## Princípio central

> A IA prepara e testa a automação. O Flow Bot executa as conversas.

A IA pode ajudar a transformar documentos, tabelas de preços, serviços, horários, políticas e exemplos de conversa em fluxos, regras, respostas e cenários de teste. Esses artefatos são validados, revisados e publicados como configurações versionadas. Durante o atendimento, o runtime não chama modelos de IA, não envia prompts, não usa embeddings e não depende de tokens.

## Objetivos da primeira versão

- Receber eventos por adaptadores de canal, começando com um adaptador de teste e contratos preparados para WhatsApp.
- Avaliar gatilhos e regras determinísticas: texto exato normalizado, palavras-chave, contém, começa/termina com e RegEx protegida.
- Executar fluxos com mensagens, menus, espera por resposta, condições, captura de dados, variáveis, atrasos e encaminhamento humano.
- Persistir o estado da conversa e retomar execuções após reinicialização.
- Oferecer simulador, histórico, logs e validação antes da publicação.
- Importar/exportar configurações estruturadas, inclusive geradas por ferramentas externas de IA.

## Fora do escopo inicial

- Não é um aplicativo Android semelhante ao AutoResponder.
- Não é um provedor de WhatsApp nem uma biblioteca de sessão WhatsApp.
- Não é um chatbot que usa IA para interpretar toda mensagem em tempo real.
- Não será incorporado ao repositório ou banco de dados do Flow nesta fase.
- Não copiará código, identidade visual, textos ou recursos protegidos do AutoResponder ou de outros projetos.

## Estado atual (Etapas A–C)

- `packages/contracts` (`@flow-bot/contracts`): formato `flow-bot/v0`, catálogo inicial de nós, validador sintático e
  semântico, RegEx segura e JSON Schema formal em `packages/contracts/schema/flow-bot-v0.schema.json`.
- Sem runtime, sem interface, sem canal real, sem IA e sem envio de mensagens.

```sh
npm ci
npm run format:check && npm run lint && npm run typecheck && npm test
npm run schema   # regrava o JSON Schema a partir do código
```

## Estrutura documental

- `docs/REVERSE_ENGINEERING.md` — síntese do APK e dos cinco vídeos.
- `docs/GITHUB_REFERENCES.md` — três referências escolhidas e auditoria de licenças.
- `docs/ARCHITECTURE.md` — arquitetura proposta.
- `docs/FLOW_FORMAT.md` — formato declarativo de automação.
- `docs/AI_AUTHORING.md` — pipeline de IA fora do runtime.
- `docs/SECURITY_RELIABILITY.md` — segurança, idempotência, filas e limites.
- `docs/ROADMAP.md` — sequência de implementação.
- `docs/DECISIONS.md` — decisões arquiteturais iniciais.
- `docs/TECH_DECISIONS.md` — matriz de decisões técnicas da Etapa A.
- `docs/DEPENDENCIES.md` — dependências fixadas e licenças.
- `packages/contracts/README.md` — catálogo de nós e códigos de erro do validador.
- `prompts/CLAUDE_CODE_BOOTSTRAP.md` — instruções para preparar o repositório público e começar pelo MVP.

## Repositório pretendido

`herslander-netizen/flow-bot` (nome sugerido; ainda precisa ser criado no GitHub).

## Licença do projeto

A licença do Flow Bot ainda precisa ser confirmada antes da publicação. Recomendação inicial: MIT para o código original do projeto, mantendo os avisos de copyright e licenças de todas as dependências. Ver `docs/GITHUB_REFERENCES.md` e `docs/DECISIONS.md`.
