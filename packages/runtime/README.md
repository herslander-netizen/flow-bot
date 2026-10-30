# @flow-bot/runtime

Motor determinístico: um evento entra, a conversa avança e saem ações como dados. Não envia mensagens, não grava em
banco, não lê o relógio e não chama IA.

```ts
import { compilar, novaSessao, processar } from "@flow-bot/runtime";

const plano = compilar(fluxo); // lança FluxoInvalido com os problemas do validador
let sessao = novaSessao(plano.doc.flow.id);
const r = processar(plano, sessao, { type: "message", id: "msg-1", at: Date.now(), text: "oi" });
sessao = r.sessao; // gravar
// r.acoes: send_text, send_quick_replies, schedule (acordar em `at`), webhook, handoff
// r.passos: rastro da decisão (nó, tipo, porta, detalhe)
```

## Eventos

- `message`: mensagem do contato. Se a sessão espera resposta, ela segue pela porta `reply`; senão os gatilhos são
  avaliados (`trigger.keyword` por prioridade, depois `trigger.message_received`).
- `timer`: o prazo de uma espera ou de um atraso venceu (quem chamou agendou pela ação `schedule`).
- `webhook_result`: resultado da chamada pedida pela ação `webhook` (`success`/`failure`).

## Garantias

- **Reprodutível:** a mesma sessão + o mesmo evento geram sempre a mesma saída (o sorteio usa o id do evento).
- **Sem execução infinita:** teto de passos por evento (`limits.maxStepsPerEvent`, no máximo 200), `logic.goto` com
  `maxVisits` e ciclos sem espera recusados pelo validador.
- **Sem efeitos:** a sessão recebida não é alterada; a nova sessão vem no resultado.

## Simulador

```sh
npm run simular -- examples/boas-vindas-menu.json examples/boas-vindas-menu.cenarios.json
```

Cenários: `say` (mensagem), `wait` (segundos; dispara os prazos vencidos), `webhook` (true/false) e `expect`
(`replies`, `contains`, `status`, `cursor`, `variables`, `handoff`).
