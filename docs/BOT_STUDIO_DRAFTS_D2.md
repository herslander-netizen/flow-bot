# Bot Studio D2 — rascunhos persistentes

A migração 0110 acrescenta histórico de rascunhos ao schema existente do motor.
Não altera flow_versions, conversas, filas, Evolution ou o publicador.

## Contrato interno

StudioDrafts usa o Pool PostgreSQL existente. O chamador confiável fornece
StudioScope (workspaceId, environment, actorId) a partir da identidade autenticada.
Nunca derivar esse escopo de campos enviados pelo navegador. Ainda não há rota HTTP.

- save(scope, flowId, expectedRevision, document): valida pelo contrato oficial,
  exige status draft, mesmo flowId e até 1 MiB. Revisão inicial esperada: 0.
  Conflito devolve currentRevision; o editor deve recarregar antes de tentar novamente.
  Documento igual com revisão atual não cria nova revisão.
- get(scope, flowId, revision?): consulta a revisão indicada ou a mais recente.
- history(scope, flowId, beforeRevision?): até 50 metadados, mais recentes primeiro.
  Use a última revisão da página como cursor.

As gravações são serializadas por escopo e fluxo com advisory lock transacional.
Cada edição cria um registro novo, sem UPDATE ou DELETE no serviço.
A separação lógica por workspace e ambiente não substitui bancos e credenciais
separados para homologação e produção. Apenas test e staging são aceitos nesta fase.
Não expor o banco ao navegador; autorização por ação será exigida no backend.

## Próximos gates

1. Aprovação humana vinculada a revisão exata, com testes independentes
   executados pelo motor. Edição nova não herda aprovação.
2. Identidade autenticada, permissões por ação e API de autoria separada do canal.
3. Integrar interface e agentes com escopo autenticado; não usar tokens da Evolution.
4. Publicação somente por comando autorizado, com verificação transacional de
   aprovação e revisão; preservar o publicador atual até revisão de compatibilidade.

Não executar migrações fora de um banco descartável de teste nesta PR.
Não enviar mensagens reais nem contratar serviços.
