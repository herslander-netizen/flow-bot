# @flow-bot/store-postgres

Execução durável do Flow Bot em Postgres. Junta o motor puro (`@flow-bot/runtime`) a um banco: nada se perde se o
processo reiniciar, nada é processado ou enviado duas vezes.

```ts
import pg from "pg";
import { FlowBot, migrar } from "@flow-bot/store-postgres";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await migrar(pool); // cria o schema flow_bot (só acréscimo)
const bot = new FlowBot({ pool });

await bot.publicar("meu-negocio", fluxo); // versão imutável; recusa fluxo inválido
await bot.receberMensagem({
  workspaceId: "meu-negocio",
  conversationKey: "5582999990000",
  flowId: "boas-vindas-menu",
  eventKey: "whatsapp:<id da mensagem>", // reenvio do provedor = ignorado
  text: "oi",
});

// Em um laço (ex.: a cada 1–5 s), em um ou vários processos:
await bot.processarVencidos(); // fim de espera e de atraso
await bot.entregarPendentes(async ({ acao, chave }) => {
  // enviar pelo canal usando `chave` como id idempotente
  return { ok: true };
});
```

## Garantias

| Garantia                                          | Como                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Evento repetido não reprocessa                    | `inbound_events` com chave única por workspace                                         |
| Duas mensagens da mesma conversa não se atropelam | `SELECT … FOR UPDATE` na conversa, dentro da transação                                 |
| Tudo ou nada                                      | evento, sessão, prazos, saídas e histórico na mesma transação                          |
| Prazos sobrevivem a reinício                      | tabela `jobs`; itens reservados e não concluídos voltam após a reserva expirar         |
| Entrega sem duplicar                              | chave de idempotência `<evento>#<n>` repassada ao adaptador                            |
| Ordem por conversa                                | uma resposta só sai depois que a anterior foi entregue, falhou de vez ou foi cancelada |
| Falha do canal não perde a resposta               | novas tentativas (5 s, 10 s, 20 s… até 1 h), depois `failed`                           |
| Conversa em andamento não muda de fluxo           | sessão presa à versão em que começou; livre, passa à versão nova                       |
| Isolamento                                        | tudo por `workspace_id`; filas podem rodar por workspace                               |

Webhook: o adaptador executa a chamada e o resultado (ok ou falha) volta para a conversa como evento, sem reenvio às
cegas.

## Testes

Precisam de um Postgres em `DATABASE_URL` (na CI há um serviço Postgres 16). Sem a variável, a suíte é pulada.

```sh
DATABASE_URL=postgres://usuario:senha@localhost:5432/banco_de_teste npm test
```
