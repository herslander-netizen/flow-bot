# PROMPT — Criar e iniciar o Flow Bot

Você é o engenheiro responsável pela fundação do projeto público **Flow Bot**, um motor de automação conversacional determinístico. Leia todos os documentos de `docs/` antes de propor ou escrever código.

## Objetivo

Preparar o repositório público independente `herslander-netizen/flow-bot`. Não alterar nenhum repositório do produto Flow/Cortaí. O projeto deve permitir que ferramentas de IA preparem e validem configurações, enquanto o atendimento em produção é executado por um runtime sem IA, sem tokens e sem chamadas a modelos.

## Referências técnicas aprovadas para estudo

1. https://github.com/nizarfadlan/whatsapp-flow — MIT; estudar modelo de fluxos, sessões, logs, adaptadores e estrutura. Não copiar o produto inteiro.
2. https://github.com/xyflow/xyflow — MIT; avaliar `@xyflow/react` exclusivamente para o editor visual.
3. https://github.com/statelyai/xstate — MIT; avaliar statecharts/actors para o ciclo de vida das conversas.

Typebot usa FSL-1.1-Apache-2.0 Future License (restrição de uso concorrente); WA Convo usa GPL-3.0. Não incorporar código desses projetos nesta fase.

## Regras obrigatórias

- Primeiro conferir se o repositório existe e se está vazio; nunca sobrescrever conteúdo existente.
- Se não existir, criar no GitHub como público com o nome `flow-bot`, caso a ferramenta/ambiente tenha permissão. Se não houver permissão para criar repositório, gerar o bootstrap local e informar o bloqueio, sem fingir que publicou.
- Não acessar nem alterar o repositório `herslander-netizen/cortai-app` ou `evolution-crm`.
- Não usar o APK como fonte de código copiável; usá-lo somente como referência funcional.
- Não copiar branding, assets, textos protegidos ou código de projetos analisados.
- Não adicionar conectores de WhatsApp no núcleo do motor.
- Não incluir integração LLM no runtime, nem dependência SDK OpenAI/Anthropic/Gemini para processar mensagens.
- Não criar infraestrutura paga, secrets, bancos remotos ou deploy sem autorização.
- Não escolher licença sem confirmar a decisão documentada em `docs/DECISIONS.md`.
- Fixar versões de dependências depois de consultar versões atuais e revisar licenças.

## Sequência de execução

### Etapa A — validação do plano

- Confirmar que leu todos os documentos.
- Apresentar uma matriz curta de decisões técnicas: TypeScript runtime, DSL, persistência, fila durável, React Flow e XState.
- Revisar repositórios de referência, dependências, licenças e maturidade antes de reutilizar qualquer código.
- Não copiar código ainda.

### Etapa B — repositório e CI mínima

- Criar README, estrutura docs e convenções de contribuição.
- Configurar TypeScript, formatação, lint, testes e CI.
- Deixar licença própria pendente até confirmação.

### Etapa C — primeiro código

- Implementar apenas pacote de contratos/DSL e validador.
- Criar catálogo inicial de nós e JSON Schema formal.
- Escrever testes para nós desconhecidos, conexões inválidas, IDs duplicados, variáveis não declaradas, loops sem limite e timeouts ausentes.
- Não implementar UI, provider real, IA ou envio de mensagens nesta etapa.

### Etapa D — relatório

Entregar: árvore do projeto, decisões tomadas, dependências/licenças, testes executados e resultados, limitações, arquivos alterados e próximos passos. Não declarar execução bem-sucedida de comandos que não foram rodados.
