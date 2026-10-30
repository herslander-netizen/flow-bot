# Realidade: como o Flow Bot vira modelo de automação para qualquer sistema

## A ideia

O fluxo nunca inventa um fato do negócio. Tudo o que muda no mundo real — se está aberto, quais serviços e preços
existem, qual o próximo horário livre, o endereço, se há alguém da equipe disponível — vem do **sistema hospedeiro**
a cada mensagem, pelo namespace `reality.*`.

```
mensagem ─► sistema hospedeiro ─► retrato da realidade (fatos de agora)
                                   │
                                   ▼
                        Flow Bot (motor determinístico, sem IA)
                                   │
                                   ▼
                       respostas ─► canal (WhatsApp etc.)
```

- **Perfil de realidade** (`PerfilDeRealidade`, JSON Schema em
  `packages/contracts/schema/reality-profile-v1.schema.json`): a lista de fatos que um sistema promete entregar, com
  tipo, descrição e exemplo. Ex.: `presets/flow/perfil.json` (`flow/v1`).
- **Fluxo**: declara o perfil que usa (`"reality": "flow/v1"`) e cita os fatos em textos (`{{reality.address}}`) e
  condições (`reality.isOpen` com `is_true`). O validador recusa fato que o perfil não tem e qualquer tentativa de
  gravar na realidade.
- **Retrato**: a cada evento o hospedeiro entrega os valores atuais (`FlowBot({ realidade })` ou
  `processar(..., { realidade })`). Fato citado e não entregue fica registrado (`realidadeAusente` /
  `executions.reality_missing`) e reprova o cenário no simulador.

## Usar em outro sistema (passo a passo)

1. **Escreva o perfil** do seu sistema: `{ "id": "clinica/v1", "name": "...", "facts": [...] }` com os fatos que o
   seu sistema sabe responder (ex.: `reality.nextAppointment`, `reality.acceptedPlans`).
2. **Monte os fluxos** citando só esses fatos. A IA pode preparar o rascunho a partir do perfil e dos documentos do
   negócio; o validador e o simulador decidem se ele serve.
3. **Escreva os cenários** de teste (`presets/flow/atendimento.cenarios.json` é o modelo) e rode:
   `npm run simular -- fluxo.json cenarios.json perfil.json`.
4. **Ligue o hospedeiro**: implemente a função `realidade({ workspaceId, conversationKey, agora })` que lê o seu banco
   e o adaptador de saída do seu canal (`entregarPendentes`).
5. **Publique** a versão (`FlowBot.publicar`) e rode os laços `processarVencidos` e `entregarPendentes`.

Nada do motor muda entre sistemas: muda o perfil, os fluxos e os dois pontos de ligação (realidade e canal).

## Boas práticas

- Fatos **prontos para o cliente**: o hospedeiro entrega "hoje das 9h às 19h", não um JSON de horários. O fluxo só
  repete; a regra de negócio fica no sistema que é dono dela (no Flow, o motor oficial de agenda).
- Fatos **baratos**: o retrato é calculado a cada mensagem; prefira consultas simples ou um cache curto.
- **Sem dados de terceiros**: o retrato é do negócio e do próprio contato, nunca de outros clientes.
- **Versão no id do perfil** (`/v1`, `/v2`): mudou o significado de um fato, sobe a versão.
