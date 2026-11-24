# Bot Studio D3 — API privada de autoria

Esta API usa o armazenamento de rascunhos e aprovações das PRs anteriores.
Não é o servidor de atendimento. Não contém publicador, webhook ou envio.

## Autenticação

createStudioApi recebe dependências de persistência e uma lista de credenciais
de serviço configuradas no backend. Cada credencial possui workspace, ambiente
(test ou staging), actorId e permissões (read, write, simulate, approve).
Use segredos aleatórios de alta entropia com pelo menos 32 caracteres.
Authorization: Bearer <token> é obrigatório. Não inclua tokens no navegador,
repositório ou logs. Não use as credenciais da Evolution.

O servidor deve ser ligado somente em interface privada e chamado por um BFF
que autentique cada operador. O BFF deve garantir identidade e permissões
individuais e a origem independente dos cenários de revisão. Ainda não há
login de usuários, provisionamento de credenciais, revogação dinâmica, rate
limiting, TLS ou configuração de implantação. Não expor diretamente à internet.

## Rotas

Todas começam com /studio/v1/flows/{flowId}.

| Método e sufixo | Permissão | Entrada |
| --- | --- | --- |
| GET /draft | read | revision opcional na query |
| PUT /draft | write | expectedRevision e document |
| GET /history | read | before opcional na query |
| POST /simulate | simulate | revision, scenarios e baseRevision opcional |
| GET /approval | read | nenhuma |
| POST /approval | approve | revision, confirmation e scenarios |

A API de simulação desta etapa usa fluxos sem perfil de realidade externo.
Não aceita perfil ou escopo arbitrário do cliente. A integração de perfis
confiáveis por workspace será necessária antes de homologar esses fluxos.

Corpo JSON até 1 MiB. Revisão inicial esperada 0. Erros: 400 entrada inválida,
401 sem credencial, 403 sem permissão, 404 recurso ausente, 405 método não
permitido, 409 conflito de revisão, 413 corpo excedido, 422 validação.

Uma simulação executada pode conter cenários reprovados. Verifique
scenariosPassed, não apenas o status HTTP. Aprovação não é publicação.

## Homologação

Teste com PostgreSQL descartável no CI, sem Evolution e sem chamadas de IA.
A PR inclui teste HTTP com credenciais diferentes e verificação de que nenhum
fluxo foi publicado. Não aplicar migrações em produção. Não alterar a frente
visual até a revisão do contrato. O BFF e a prévia navegável continuam pendentes.
