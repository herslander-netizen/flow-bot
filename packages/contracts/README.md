# @flow-bot/contracts

Contrato `flow-bot/v0`: tipos, catálogo de nós, validador e JSON Schema. Não executa fluxos, não fala com canais e
não usa IA.

```ts
import { validarFluxo } from "@flow-bot/contracts";

const r = validarFluxo(JSON.parse(texto));
if (!r.ok) for (const p of r.problems) console.log(p.code, p.path, p.message);
```

## Catálogo inicial

| Tipo                       | Portas de saída            | Observação                                 |
| -------------------------- | -------------------------- | ------------------------------------------ |
| `trigger.message_received` | `next`                     | Gatilho explícito para "qualquer mensagem" |
| `trigger.keyword`          | `next`                     | Correspondência + prioridade               |
| `message.text`             | `next`                     | Texto com `{{variáveis}}`                  |
| `message.quick_replies`    | `next`                     | Até 10 opções                              |
| `logic.condition`          | `true`, `false`            |                                            |
| `logic.switch`             | `case:<valor>`…, `default` |                                            |
| `logic.match`              | `matched`, `no_match`      | Compara `message.text` ou outra variável   |
| `logic.random`             | `branch:<n>`…              | Sorteio com semente registrada             |
| `logic.goto`               | `exhausted`                | `maxVisits` obrigatório                    |
| `state.wait_for_reply`     | `reply`, `timeout`         | `timeoutSeconds` obrigatório; suspende     |
| `data.capture`             | `valid`, `invalid`         | Grava em `session.*`                       |
| `data.set_variable`        | `next`                     | Grava em `session.*`                       |
| `time.delay`               | `next`                     | Suspende                                   |
| `action.webhook`           | `success`, `failure`       | HTTPS e `timeoutMs` obrigatórios           |
| `action.handoff`           | —                          | Terminal                                   |
| `action.end`               | —                          | Terminal                                   |

Modos de correspondência: `exact`, `contains`, `starts_with`, `ends_with`, `pattern` (curinga `*`), `regex`
(subconjunto seguro) e `similarity` (com limiar no nó ou em `defaults.similarityThreshold`).

Variáveis: `contact.firstName`, `contact.name`, `conversation.messageCount`, `message.text` e `session.*` (declaradas
em `variables`).

## Códigos do validador

`estrutura`, `id_duplicado`, `no_desconhecido`, `config_invalida`, `entrada_inexistente`,
`aresta_origem_inexistente`, `aresta_destino_inexistente`, `aresta_para_gatilho`, `porta_invalida`,
`porta_repetida`, `saida_obrigatoria_ausente`, `espera_sem_tratamento_de_timeout`, `goto_destino_inexistente`,
`variavel_invalida`, `variavel_nao_declarada`, `variavel_duplicada`, `no_inalcancavel`, `loop_sem_limite`,
`regex_insegura`, `curinga_total`, `limiar_ausente`, `atraso_invalido`.
