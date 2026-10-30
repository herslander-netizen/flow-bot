# Ligar qualquer sistema ao Flow Bot

O Flow Bot é um **serviço separado**. O seu sistema (o Flow ou outro que você criar) não importa código do motor:
ele só responde a dois endereços HTTP. O WhatsApp chega pela **Evolution API** (gratuita, hospedada por você).

```
 Cliente no WhatsApp
        │
        ▼
 Evolution API ──aviso (x-webhook-secret)──► Flow Bot ──GET realidade (Bearer)──► SEU SISTEMA
        ▲                                     │   ◄── { "reality.isOpen": true, … }
        └──────── /message/sendText ──────────┘
                                              └──POST equipe (Bearer) quando vai para humano──► SEU SISTEMA
```

## O que o seu sistema implementa

### 1. Realidade — `GET {realityUrl}?workspace={id}&conversation={telefone}`

- Cabeçalho `Authorization: Bearer {token}`: confira e recuse sem ele.
- Resposta `200` com um objeto JSON só de fatos `reality.*` do seu perfil, valores prontos para o cliente:

```json
{
  "reality.businessName": "Studio Exemplo",
  "reality.isOpen": true,
  "reality.todayHours": "hoje das 9h às 19h",
  "reality.services": ["Corte — R$ 45,00", "Escova — R$ 60,00"]
}
```

- Responda em até **2,5 s**. Fora do ar ou lento: o Flow Bot segue sem os fatos e registra quais faltaram.
- Valores aceitos: texto, número, verdadeiro/falso e lista de textos (até 50 itens). O resto é descartado.
- Nunca devolva dado de outro cliente.

### 2. Encaminhamento (opcional) — `POST {handoffUrl}`

Chamado quando o fluxo passa a conversa para a equipe:
`{ "workspaceId": "...", "conversationKey": "5582999990000", "note": "Cliente pediu atendimento da equipe" }`.
Responda `2xx`; erro gera nova tentativa (5 s, 10 s, 20 s… até 1 h).

### 3. Perfil e fluxos

Escreva o perfil (`docs/REALITY.md`), os fluxos e os cenários; rode o simulador; publique:

```sh
flow-bot-server publicar <workspace> fluxo.json perfil.json
```

## O que o Flow Bot garante para você

Mensagem repetida não responde duas vezes; mensagem do próprio número não gera loop; grupos não são atendidos;
respostas na ordem; nova tentativa se a Evolution falhar; nada se perde se o servidor reiniciar; mensagens apagadas
após 90 dias, aprendizado anônimo mantido (`docs/LEARNING.md`).

## Outros canais

A Evolution é o canal principal. Outra API (Meta Cloud API, WAHA…) entra como outro pacote `channel-*` com a mesma
forma (ler o aviso, enviar o texto), sem mudar o motor nem os fluxos.
