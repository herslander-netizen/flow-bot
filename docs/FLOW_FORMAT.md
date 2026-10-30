# Formato declarativo de fluxo — proposta v0

## Objetivo

A definição de automação é um contrato estável entre editor visual, AI Authoring, simulador e runtime. Ela não contém prompts de atendimento nem lógica executável arbitrária.

## Exemplo ilustrativo

```json
{
  "schemaVersion": "flow-bot/v0",
  "flow": {
    "id": "welcome-menu",
    "name": "Boas-vindas e menu",
    "timezone": "America/Maceio",
    "status": "draft",
    "entryNodeId": "welcome"
  },
  "nodes": [
    {
      "id": "welcome",
      "type": "message.text",
      "config": {
        "text": "Olá, {{contact.firstName}}! Como podemos ajudar?"
      }
    },
    {
      "id": "menu",
      "type": "message.quick_replies",
      "config": {
        "prompt": "Escolha uma opção:",
        "options": [
          { "value": "1", "label": "Agendar" },
          { "value": "2", "label": "Serviços" },
          { "value": "3", "label": "Atendente" }
        ]
      }
    },
    {
      "id": "wait-menu",
      "type": "state.wait_for_reply",
      "config": { "timeoutSeconds": 300, "maxAttempts": 2 }
    },
    {
      "id": "route",
      "type": "logic.switch",
      "config": {
        "variable": "session.menuChoice",
        "cases": ["1", "2", "3"]
      }
    },
    {
      "id": "fallback",
      "type": "message.text",
      "config": { "text": "Não reconheci essa opção. Digite 1, 2 ou 3." }
    }
  ],
  "edges": [
    { "id": "e1", "from": "welcome", "to": "menu", "port": "next" },
    { "id": "e2", "from": "menu", "to": "wait-menu", "port": "next" },
    { "id": "e3", "from": "wait-menu", "to": "route", "port": "reply" },
    { "id": "e4", "from": "route", "to": "fallback", "port": "default" }
  ]
}
```

O exemplo é conceitual e não deve ser tratado como schema validado até existir JSON Schema formal e testes de compatibilidade.

## Regras para o formato

- `schemaVersion` sempre obrigatório.
- IDs únicos e estáveis por nó/aresta.
- Nós tipados e configurações validadas por schemas específicos.
- Conexões por portas nomeadas; portas e destinos validados.
- Sem `eval`, JavaScript arbitrário, shell, SQL ou expressões de código vindas do usuário.
- Variáveis com namespaces explícitos, por exemplo `contact.firstName`, `conversation.messageCount` e `session.menuChoice`.
- Escapes e tipos de variável definidos (string, number, boolean, date, list, object limitado).
- Datas e horários com timezone IANA configurado no fluxo/workspace.
- Publicação gera uma versão imutável e checksum do conteúdo.
- Execução sempre refere-se à versão publicada; alterações de rascunho não mudam conversas em curso, salvo migração explícita de sessão.

## Matching determinístico

Ordem inicial de avaliação sugerida:

1. resposta válida para o nó `wait_for_reply` ativo;
2. opções exatas de menu;
3. correspondência exata normalizada;
4. palavras-chave/contém/início/fim;
5. RegEx segura;
6. similaridade lexical opcional com métrica determinística e limiar configurado;
7. fallback/atendimento humano.

O matching não usa classificação generativa. O resultado inclui regra escolhida, evidências e score (se similaridade estiver habilitada).

## Validações semânticas mínimas

- todo nó, exceto terminais explícitos, tem saída necessária;
- não pode existir nó inalcançável sem anotação;
- ciclos exigem limite de iterações, timeout ou condição de saída;
- espera precisa de timeout e comportamento de expiração;
- variáveis usadas precisam ser declaradas ou ter fallback;
- RegEx deve ser limitada em comprimento/complexidade;
- webhook exige destino validado, timeout e política de retry;
- mensagem enviada não pode voltar a ser tratada como inbound do mesmo bot;
- regras globais com sobreposição precisam de precedência explícita.
