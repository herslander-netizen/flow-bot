# Fila de saídas incertas (issue #9)

Estado: **PR de homologação, não publicada nem aplicada em produção**.

## Problema corrigido

A Evolution Alvo pode aceitar um pedido de envio sem conseguir demonstrar seu resultado. O adaptador marca `incerto: true` quando recebe `unknown`, `pending`, timeout ou resposta conclusivamente indisponível. Tratar isso como erro comum permitiria novas tentativas e até a próxima mensagem da fila, sem saber se a anterior chegou a ser enviada.

## Nova regra segura

- Migração aditiva `999_outbound_uncertain_gate.sql` acrescenta `delivery_uncertain boolean NOT NULL DEFAULT false` à outbox. Não remove saídas antigas.
- Ao receber `incerto: true` de uma mensagem de texto ou respostas rápidas, o motor marca `delivery_uncertain=true`, conserva `status=sending` e não reenvia automaticamente.
- O processo que reserva saídas **exclui** entradas incertas. Mensagens posteriores continuam bloqueadas pela anterior (mesma conversa), mesmo depois de reinício ou expiração da reserva.
- Outras empresas/contatos continuam trabalhando normalmente.
- O método de leitura `enviosIncertos(workspaceId)` permite listar no servidor os itens pendentes para análise, sem resolver/reenviar automaticamente. A camada HTTP de operador ainda **não** expõe esta lista, até existir autenticação pessoal e trilha de auditoria.
- Chave idempotente gerada pelo adaptador Evolution Alvo permanece a mesma em qualquer tentativa.

## Limites e provas exigidas

Este mecanismo é *fail closed*: evita novas mensagens quando uma resposta é incerta, mas não consegue afirmar se ela chegou no WhatsApp. Não confundir `accepted` com `delivered`.

**Situação de queda do processo:** se ele cair depois do envio externo e antes de gravar `delivery_uncertain`, a saída ainda poderá ser retomada com **a mesma chave idempotente** após o vencimento do lease. Essa proteção depende de o gateway manter a deduplicação por chave após reinicialização. Validar isso com a Evolution Alvo antes de produção.

Para reconciliação completa faltam: contrato de consulta de status da Evolution Alvo, evidência confiável de aceitação/rejeição por ID de mensagem e operação humana autenticada/auditada para confirmar resultado. **Não inventar endpoint de consulta.** Até essa etapa, a fila incerta permanece retida para preservar a segurança.

## Testes

Integração PostgreSQL verifica `unknown` sem reenvio, bloqueio entre ações após horas e reinício do worker, e independência entre dois workspaces. Continuar com testes de queda entre envio e commit, duplicidade do gateway, eventos atrasados e handoff real.

Não faz merge, deploy, alterações no Flow/Alvo OS ou envio a números reais.
