# Aprendizado sem guardar conversas

Decisão do responsável (30/10/2026): mensagens e histórico ficam **90 dias**; o sistema continua aprendendo depois
disso por dados **anônimos e agregados**.

## O que é guardado e por quanto tempo

| Dado                                                                                  | Tabela                         | Tempo                 |
| ------------------------------------------------------------------------------------- | ------------------------------ | --------------------- |
| Mensagem recebida, histórico de decisões, retrato da realidade                        | `inbound_events`, `executions` | 90 dias               |
| Saídas e prazos já encerrados                                                         | `outbound`, `jobs`             | 90 dias               |
| Conversa parada (sessão, variáveis capturadas)                                        | `conversations`                | 90 dias sem atividade |
| Marca de pessoa por frase (hash com segredo, só para contar)                          | `learning_phrase_contacts`     | 90 dias               |
| **Frase anonimizada** + quantas pessoas e vezes                                       | `learning_phrases`             | sem prazo             |
| **Contadores por dia** (assuntos, caminhos, motivos, encaminhamentos, fatos ausentes) | `learning_counters`            | sem prazo             |

`FlowBot.limparAntigos()` faz a limpeza em lotes; rode uma vez por dia.

## Como a frase fica anônima

1. Telefone, e-mail, CPF/CNPJ, link, valor em R$ e números com 3+ dígitos viram marcadores (`[telefone]`, …).
2. O nome do próprio contato vira `[nome]`.
3. Minúsculas, sem acento e sem pontuação, para juntar a mesma pergunta escrita de jeitos diferentes.
4. **Só aparece no relatório quando vista em conversas de pelo menos 3 pessoas diferentes.** Uma mensagem única e
   pessoal (inclusive com nomes de terceiros que o passo 2 não pega) nunca chega ao relatório.
5. Sem `segredoDoAprendizado` configurado, nenhuma frase é registrada (só os contadores).

## Como isso alimenta o sistema

1. `perguntasSemResposta(workspace)`: o que mais aparece sem assunto ou como resposta inválida.
2. A IA, **fora do atendimento**, transforma a lista em propostas (gatilho, resposta, cenários de teste).
3. Validador + simulador conferem; o responsável aprova; `publicar` cria a versão nova.
4. `contadores(workspace)` mostra o efeito: menos "sem assunto", menos encaminhamentos por resposta inválida.
