# Engenharia reversa funcional — AutoResponder WA

## Escopo e confiança

Material analisado:

- APK `AutoResponder WA.apk`, pacote `tkstudio.autoresponderforwa`, versão identificada 5.3.2 (versionCode 417), aproximadamente 16,36 MB.
- Cinco gravações de tela enviadas em 30/10/2026, com duração total aproximada de 2min34s.
- Dossiê extraído anteriormente: manifesto, strings, layouts, classes/métodos DEX, preferências e DDL SQLite.

A análise do APK é estática, complementada por inspeção visual dos cinco vídeos. Isso permite reconstruir a especificação funcional observável, mas não equivale ao código-fonte original nem comprova todos os caminhos internos. Distinguir sempre:

- **Observado:** visível nos vídeos ou diretamente declarado no APK.
- **Inferido:** conclusão técnica plausível a partir de classes, strings, layouts e referências.
- **A validar:** comportamento que exige teste funcional controlado.

## Arquitetura original observada

O APK é um aplicativo Android local. Seu serviço `NotificationReceiver` herda de `NotificationListenerService`, observa notificações e usa referências a `RemoteInput`/ações de notificação para respostas rápidas. Depende de acesso às notificações e do conteúdo/ação disponível nelas. Isso não é uma arquitetura de servidor nem deve ser copiado como base do Flow Bot.

O Flow Bot deve receber eventos por adaptadores e webhooks de provedores, sem depender de um telefone Android ligado.

## Funcionalidades identificadas

### 1. Gatilhos e correspondência

- Correspondência exata.
- Correspondência por similaridade.
- Correspondência por padrões.
- RegEx avançada.
- Mensagem de boas-vindas/primeira interação.
- Regra coringa para qualquer mensagem.
- Possibilidade de tratar padrões de exclusão.
- Normalização de caixa, acentos e espaços no modo exato.
- Ordenação/prioridade das regras.

### 2. Respostas

- Resposta automática única.
- Múltiplas respostas nos modos: todas, aleatória ou uma resposta.
- Atraso mínimo/máximo.
- Atrasos por resposta individual.
- Cancelamento de respostas pendentes de outras regras para o mesmo contato.
- Cabeçalhos/rodapés globais e substituição de variáveis.

### 3. Escopo e destinatários

- Indivíduos, grupos ou ambos.
- Lista de contatos específicos.
- Lista de contatos ignorados.
- Seleção de versão/pacote de mensageria.

### 4. Condições e controles por conversa

- Dias e janelas de horário.
- Condição de regra anterior acionada em uma janela de tempo.
- Pausa por tempo ou quantidade de mensagens por conversa.
- Probabilidade de disparo.
- Sub-regras e navegação para regra anterior ou ID configurado.
- Condições físicas do Android: tela desligada, carregamento, silencioso, DND e modo carro.

As condições físicas são específicas do telefone e não fazem sentido no runtime cloud. Só devem ser substituídas por estados conhecidos do canal/negócio, como horário de atendimento, disponibilidade de atendente ou status de serviço.

### 5. Menus e fluxos

Os vídeos mostram a seção “Submenu/Fluxo de conversação”, incluindo opções para ir para uma regra. A reconstrução deve tratar fluxos como grafos de etapas com estado persistente por conversa, e não apenas como regras isoladas ligadas por IDs.

### 6. Variáveis e substituições

A tela “Substituições de resposta” permite cadastrar um nome e um texto de substituição reutilizável. O DEX contém marcadores para mensagem recebida, contato, nome, mensagem enviada, contadores, data/hora, grupos, resultado de Sheets e grupos de captura de RegEx, além de variáveis randômicas.

O Flow Bot deve definir uma gramática de variáveis própria, tipada e versionada. Nunca avaliar código arbitrário dentro de uma variável.

### 7. Saídas e integrações

Nos vídeos e no APK aparecem Google Sheets, webhook com configurações de autenticação/cabeçalhos e integração Tasker/MacroDroid. Os conectores de IA do AutoResponder também aparecem, mas serão intencionalmente excluídos do runtime do Flow Bot.

Para o MVP, preferir webhooks/ações através de adaptadores com allowlist, timeout, assinatura, limites e logs redigidos. Integração direta com planilhas pode ficar para uma fase posterior.

### 8. Administração e observabilidade

Os vídeos mostram as opções de regras, substituições, testar regras, histórico, estatísticas, configurações e automação Tasker. A tela de estatísticas possui filtros de período e indicadores de desempenho.

O Flow Bot deve oferecer simulador, registro de cada decisão (regra/nó escolhido, motivo e resultado), histórico por conversa e métricas por fluxo.

## Observações específicas dos cinco vídeos

1. **Gravação 1:** tela inicial e concessão de acesso às notificações Android; reforça a natureza local do app original.
2. **Gravação 2:** criação/edição de regra; modos exato, similaridade, padrões, RegEx e mensagem de boas-vindas; respostas simples/múltiplas e configurações de integração.
3. **Gravação 3:** atrasos, cancelamento de respostas pendentes, destinatários, contatos específicos/ignorados, condições, saídas por Sheets/webhook, pausa por conversa e submenu/fluxo.
4. **Gravação 4:** navegação principal, substituições de resposta, formulário para nome/substituição e interação de teste/conversa.
5. **Gravação 5:** histórico, estatísticas por períodos e conteúdo de ajuda da integração Tasker.

## Estrutura SQLite observada (não copiar diretamente)

O dossiê reconstruiu tabelas `rules`, `answer_replacements`, `contacts`, `reply_stats` e `rule_executed`. A tabela `rules` concentra muitos campos de gatilho, resposta, destinatário, horário, condições, sub-regra, webhook e Google Sheets.

Isso é útil como inventário de recursos, mas é um modelo legado de aplicativo local. O Flow Bot deve usar grafos versionados, sessões e execuções duráveis, com separação entre configuração, runtime e eventos.

## Decisão de produto

**O Flow Bot não vai replicar o AutoResponder como aplicativo Android.** Vai incorporar seus conceitos de regra, filtros, resposta, pausa, variáveis, subfluxo e histórico em um motor de automação moderno, agnóstico de canal, com IA utilizada apenas na preparação/validação das configurações.

## Capturas de tela adicionais (30/10/2026)

Observado nas capturas do editor de regras e das configurações globais (descrito com palavras próprias):

- Editor de regra com botão "todas as mensagens" e cinco modos: exato, similaridade, padrão (curinga), RegEx e
  boas-vindas para quem não é contato. Ajuda de cada modo em diálogo próprio.
- Exato ignora acentos, caixa, espaços repetidos, emojis e pontuação; aceita várias frases separadas por vírgula.
- Similaridade usa um limiar global (50% sugerido) e só casa mensagens de comprimento parecido.
- Padrão: `*` como "qualquer trecho" e `//` como "ou" (ex.: começa com, termina com, contém).
- RegEx sem diferenciar maiúsculas, com grupos de captura reaproveitados na resposta.
- Configurações globais: ignorar acentos, cabeçalho e rodapé das respostas, "não responder se o padrão casar",
  contatos específicos e ignorados (que a regra pode sobrescrever), atraso mínimo/máximo padrão, impedir repetição da
  mesma regra por N segundos, limiar de similaridade, comandos por mensagem para ignorar/reativar contato, destino de
  registro (planilha/webhook).

Reflexo no Flow Bot v0: modo `pattern` (curinga, sem RegEx), bloqueio de padrão só com `*` (o "todas" é o gatilho
explícito `trigger.message_received`) e `defaults` do fluxo (`ignoreAccents`, `similarityThreshold`,
`delaySeconds`, `repeatPauseSeconds`). Cabeçalho/rodapé, listas de contatos e comandos de ignorar ficam para a fase
do runtime e dos adapters.
