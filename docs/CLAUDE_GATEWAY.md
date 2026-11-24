# FlowBot — Oficina multiagente de autoria de fluxos com Claude

> **Não é um chatbot Claude no atendimento.** Claude trabalha com os agentes de configuração do FlowBot. O runtime de WhatsApp continua determinístico, via Evolution Alvo, sem consumir Claude por mensagem.

## Arquitetura e responsabilidades

| Agente             | Responsabilidade                                                       | Execução                                           |
| ------------------ | ---------------------------------------------------------------------- | -------------------------------------------------- |
| Intake             | Receber briefing sanitizado e perfil de realidade válido por workspace | Local, determinístico                              |
| Claude / Arquiteto | Propor grafo declarativo `flow-bot/v0` + cenários + lacunas            | Anthropic Messages API, sob demanda                |
| Validador          | Validar estrutura, nós, conexões, permissões, limites e placeholders   | Código local `validarFluxo`                        |
| Guardião de ações  | Rejeitar `action.webhook` e quaisquer nós não autorizados na autoria   | Código local; sem ferramentas de IA                |
| Simulador          | Compilar e reproduzir cenários sem WhatsApp ou chamadas externas       | Código local `compilar` + `simular`                |
| Revisor            | Examinar lacunas, corrigir informações e aprovar versão                | Operador humano                                    |
| Publicador         | Publicar nova versão após aprovação por procedimento distinto          | Comando manual existente, nunca usado pela oficina |

Os agentes de validação e simulação são **estágios determinísticos do código**. Não são processos autônomos de Claude Code nem uma equipe remota executando alterações por conta própria.

## Instalação sem ativação automática

A implementação está na PR #15, em **rascunho**. Integração desligada por padrão. Nenhuma chave está no código; nenhum token real foi adicionado; as mensagens recebidas pela Evolution não acionam o Claude.

Ao executar a oficina deliberadamente, os requisitos são:

- Node.js >= 22; `npm ci` e `npm run build`.
- `FLOWBOT_CLAUDE_AUTHORING_ENABLED=1` — **somente** para uma execução de homologação aprovada.
- `ANTHROPIC_API_KEY` — segredo configurado diretamente no ambiente backend.
- `FLOWBOT_CLAUDE_MODEL` — ID de modelo confirmado na Claude Console.
- `DATABASE_URL` — PostgreSQL dedicado ao motor FlowBot, com migração `0100_claude_gateway.sql`.
- `FLOWBOT_CLAUDE_DAILY_LIMIT=2` — máximo de solicitações reservadas por workspace e dia UTC (1 a 20).
- `FLOWBOT_CLAUDE_MAX_OUTPUT_TOKENS=6144` — 1024 a 8192 por chamada.

**A API Anthropic é cobrada à parte da assinatura Claude.** A quota local limita chamadas, não substitui limites financeiros configurados junto ao fornecedor.

## Como os agentes recebem um briefing

Arquivo local `briefing.json` de exemplo; dados fictícios, sem conversas pessoais:

```json
{
  "workspaceId": "flowbot",
  "requestKey": "primeira-versao-fluxo-2026-0001",
  "briefing": "Negócio de serviços. Cumprimente, liste opções: serviços, horário, valores, falar com a equipe. Preço não fornecido: não inventar. Atendimento humano quando pedido. Criar cenários de teste."
}
```

Para executar sem perfil, omita a propriedade `perfil`. Se um fluxo citar `reality.*`, informe um PerfilDeRealidade validado. A IA recebe apenas o briefing e o perfil, não números de WhatsApp, chaves nem os identificadores de controle.

```sh
npm ci
npm run build
npm run autor:claude -- ./briefing.json ./proposta-flowbot.json
```

O arquivo de saída, criado sem sobrescrever arquivos existentes, contém `flow`, `scenarios`, `gaps`, `problems`, `tests`, `status`, `approved:false`, `published:false` e métricas de tokens. A saída é uma proposta para revisão; até um resultado `ready_for_review` **não equivale a aprovação**.

Os arquivos de briefing e proposta devem ficar fora de repositórios públicos se incluírem informações do negócio. Não use dados pessoais ou segredos de clientes na autoria externa sem autorização e base legal.

## Revisão independente — sem API e sem custo

O Claude não pode aprovar o próprio trabalho usando apenas os testes que ele mesmo gerou. Por isso, uma proposta gerada pela oficina permanece `requires_revision` até passar por **cenários independentes definidos pelo operador**.

Você pode testar esse processo sem nenhuma chave da Anthropic, banco ou conexão WhatsApp. O repositório já inclui um exemplo fictício:

```sh
npm ci
npm run build
npm run autor:revisar -- \
  examples/claude-workshop/proposta-exemplo.json \
  examples/claude-workshop/cenarios-independentes.json \
  /tmp/flowbot-relatorio.json \
  flowbot
```

O quarto argumento (`flowbot`) é o workspace esperado: uma proposta de outro estabelecimento é recusada. Para perfis que usam `reality.*`, informe o arquivo de perfil como quinto argumento. A revisão offline nunca lê `ANTHROPIC_API_KEY` e não chama APIs externas.

O relatório registra validação estrutural, cenários do Claude, cenários independentes, lacunas, problemas e `sourceSha256` (identificação de conteúdo, **não** assinatura/autorização). Em hipótese alguma o comando `autor:revisar` executa o publicador. Todos os resultados carregam `approved:false` e `published:false`.

**Regras de bloqueio:**

- Sem cenários independentes, a proposta não é elegível para revisão.
- Cenários independentes precisam conter alguma verificação de resultado, não apenas uma mensagem enviada.
- Falhas ou lacunas retornam `requires_revision`; o comando termina com código 2, deixando o relatório gravado.
- O relatório não pode sobrescrever arquivo existente e mantém os dados isolados no workspace solicitado.
- Mesmo com todos os testes aprovados, um operador deve confirmar as informações do negócio e autorizar uma publicação **separadamente**.

## Garantias da implementação

- `flow.status` deve ser **draft**. Qualquer candidato `published` é rejeitado.
- `action.webhook` é bloqueado nos fluxos gerados. O Claude não recebe ferramentas nem capacidade de executar ações.
- `validarFluxo` e `compilar` conferem o grafo; `simular` testa os cenários gerados, sem canal.
- Lacunas ou cenários que falham produzem `requires_revision`.
- Idempotência e limite por workspace são persistidos no banco **antes** da chamada ao Claude; timeout não ocasiona tentativa automática.
- A chave do provedor fica apenas em variáveis de ambiente, nunca no GitHub/Worker/browser.
- Não existe endpoint `/ops/ai/claude/draft` no serviço de atendimento, nem disparo WhatsApp nessa oficina.
- O processo de publicação existente é uma ação separada e não é invocado pelo Claude nem pelos agentes revisores.

## O que ainda depende de homologação

1. Escolher modelo e habilitar limites de gasto na Anthropic, se houver orçamento.
2. Aplicar migração no PostgreSQL isolado do FlowBot (não nos bancos de Flow e Alvo OS).
3. Executar o primeiro briefing fictício em ambiente de teste e revisar o JSON.
4. Executar revisão independente offline com cenários escritos pelo operador; revisar lacunas, casos negativos e aprovação explícita.
5. Integrar a oficina à interface de configuração de fluxos/PWA, sem colocar IA no runtime.

Documentação: [autoria de fluxos](./AI_AUTHORING.md), [API Messages](https://platform.claude.com/docs/en/api/messages/create), [saídas estruturadas](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
