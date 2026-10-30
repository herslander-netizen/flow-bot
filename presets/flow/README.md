# Preset do Flow (`flow/v1`)

Atendimento por WhatsApp de um negócio de serviços no Flow, todo sobre fatos da realidade (sem IA e sem dados
inventados).

| Arquivo                     | O que é                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `perfil.json`               | Perfil `flow/v1`: nome, aberto agora, horário de hoje, próxima abertura, próximo horário livre, serviços com preço, endereço, pagamento, link de agendar, equipe disponível                                         |
| `atendimento.json`          | Fluxo: gatilhos por assunto (agendar, preços, horário, endereço, pagamento, equipe) e, para qualquer outra mensagem, saudação (avisando se está fechado) + menu de 4 opções                                         |
| `atendimento.cenarios.json` | 18 cenários: cada assunto, aberto/fechado, equipe disponível ou não, prioridade entre assuntos, palavra que anula ("cancelar"), menu, resposta inválida, prazo sem resposta, realidade que muda no meio da conversa |

```sh
npm run simular -- presets/flow/atendimento.json presets/flow/atendimento.cenarios.json presets/flow/perfil.json
```

Linguagem neutra (negócio, profissional, cliente, atendimento), como pede o produto Flow. Os textos são ponto de
partida: cada negócio pode ajustar e o validador confere.
