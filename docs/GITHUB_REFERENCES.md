# Auditoria de referências públicas do GitHub

Data da consulta: 30/10/2026. Foram consultados os repositórios, READMEs e arquivos LICENSE por meio da integração GitHub.

## Referências selecionadas

### 1. WhatsApp Flow — nizarfadlan/whatsapp-flow

- Repositório: https://github.com/nizarfadlan/whatsapp-flow
- README: https://github.com/nizarfadlan/whatsapp-flow/blob/main/README.md
- Licença: MIT — https://github.com/nizarfadlan/whatsapp-flow/blob/main/LICENSE
- Por que estudar: é a referência funcional mais próxima. Documenta editor visual com nós de gatilho, mensagens, condições, atraso, variáveis, espera por resposta, roteamento aleatório, webhooks, encaminhamento e encerramento. Também documenta sessões, logs, adaptadores Baileys/Meta Cloud API, PostgreSQL/Drizzle, Hono/tRPC e React Flow.
- Limite: é um projeto completo de WhatsApp, não apenas um motor. Não copiar o repositório inteiro nem herdar automaticamente sua arquitetura, autenticação, providers ou modelo de dados. A consulta de commits retornou como alteração mais recente observada a implementação de roteamento por organização/tenant em 23/07/2026; isso não basta para concluir saúde ou abandono do projeto. Fazer revisão de atividade, issues, CI, dependências e segurança antes de reutilizar qualquer código.
- Uso proposto no Flow Bot: referência para catálogo de nós, ciclo de execução, sessões, logs e organização em pacotes. Código MIT poderá ser reutilizado apenas após revisão de cada módulo e preservando avisos/licenças.

### 2. React Flow / xyflow — xyflow/xyflow

- Repositório: https://github.com/xyflow/xyflow
- README: https://github.com/xyflow/xyflow/blob/main/README.md
- Licença: MIT — https://github.com/xyflow/xyflow/blob/main/LICENSE
- Por que estudar: biblioteca especializada em interfaces de nós e conexões para React/Svelte. O README confirma React Flow 12 em `@xyflow/react`, nós, arestas, controles e minimapa.
- Limite: é um editor visual, não um motor de automação, fila ou persistência de conversas.
- Uso proposto no Flow Bot: usar `@xyflow/react` para o canvas visual; manter o formato de fluxo e o runtime independentes da representação gráfica.

### 3. XState — statelyai/xstate

- Repositório: https://github.com/statelyai/xstate
- README: https://github.com/statelyai/xstate/blob/main/README.md
- Licença: MIT — https://github.com/statelyai/xstate/blob/main/LICENSE
- Por que estudar: modela estados, transições, eventos, atores e orquestração de lógica complexa em JavaScript/TypeScript. É apropriado para tornar explícito o ciclo de vida de uma sessão de conversa.
- Limite: não é um construtor de chatbot nem fornece por si só persistência durável de jobs e mensagens.
- Uso proposto no Flow Bot: avaliar XState para ciclo de vida da sessão e coordenação de estados; atrasos e retomadas precisam de armazenamento e fila duráveis externos.

## Candidatos avaliados, mas não recomendados para incorporar código agora

### Typebot — baptisteArno/typebot.io

- Repositório: https://github.com/baptisteArno/typebot.io
- A licença no arquivo LICENSE é **Functional Source License 1.1, Apache 2.0 Future License (FSL-1.1-Apache-2.0)**. O README exibe um badge AGPLv3, mas o texto efetivo do arquivo LICENSE consultado é FSL. A FSL tem uma restrição explícita a usos concorrentes que oferecem funcionalidade igual ou substancialmente semelhante. Por isso, não usar código ou derivar o Flow Bot desse projeto sem parecer jurídico e nova revisão dos termos aplicáveis.
- Pode ser observado apenas como referência de experiência de construção de chatbot, sem copiar código, marca ou conteúdo.

### WA Convo — sajidmahamud835/whatsapp-bot

- Repositório: https://github.com/sajidmahamud835/whatsapp-bot
- README: https://github.com/sajidmahamud835/whatsapp-bot/blob/main/README.md
- Licença: GPL-3.0 — https://github.com/sajidmahamud835/whatsapp-bot/blob/main/LICENSE
- O README declara dashboard, flow builder, endpoints, campanhas, templates, scheduler e múltiplos clientes. A licença GPL-3.0 impõe obrigações de copyleft na distribuição de versões derivadas. Não incorporar código no núcleo do Flow Bot sem decidir conscientemente que a arquitetura e a distribuição obedecerão à GPL e passar por revisão jurídica. Pode servir como fonte de ideias de funcionalidades.

## Recomendação

Usar uma combinação modular:

- WhatsApp Flow como referência end-to-end e possível fonte de pequenos módulos MIT após auditoria.
- React Flow como componente de edição visual.
- XState como candidato para modelar o ciclo de vida determinístico de uma sessão.

Não adotar Typebot ou WA Convo como base/fork. Não copiar grandes partes de nenhum repositório sem leitura de licença, dependências, origem do código, testes, vulnerabilidades e histórico de manutenção. O fato de um repositório ser público não significa que seu código possa ser reutilizado sem cumprir a licença.
