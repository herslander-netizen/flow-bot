# R1 — Reaproveitamento de identidade e permissões

Decisão: FlowBot continua um produto independente do Alvo OS. Reutilizar
o padrão de segurança do Alvo OS, não seu banco, credenciais ou runtime.

## Referências verificadas

- Alvo OS (evolution-crm), main: src/domain/permissoes.ts,
  src/server/contexto.server.ts e src/server/auth/vinculos.server.ts.
- FlowBot Prospecção, PRs #3, #4 e #10: Supabase Auth e tabela
  flowbot_workspace_members, papéis owner, admin, editor e viewer.
- FlowBot motor, PRs #18 a #22: CI aprovado antes desta etapa.

Não criar terceira tabela de membros. A autoridade para autoria e Prospecção
deve ser a mesma membership do projeto Supabase dedicado ao FlowBot.

## Implementação

studio-identity.ts verifica o usuário no Auth e lê apenas sua membership
do workspace selecionado, com o JWT do usuário e chave publicável. Não
confia em metadados editáveis do usuário. Ausência, ambiguidade e papel
desconhecido negam acesso. Não há cache de vínculos.

O ambiente test/staging vem da configuração do backend, não da requisição.
O cabeçalho X-Studio-Workspace é uma seleção não confiável, validada contra
o vínculo. Nunca há troca automática para outra organização.

| Papel | Ler | Editar | Simular | Aprovar |
| --- | --- | --- | --- | --- |
| owner | sim | sim | sim | sim |
| admin | sim | sim | sim | sim |
| editor | sim | sim | sim | não |
| viewer | sim | não | não | não |

A API privada recebe resolveIdentity OU principals, nunca ambos. O modo
local da PR #22 permanece exclusivamente para homologação. A nova opção
não é ligada automaticamente ao script de prévia; o BFF deverá obter e
renovar a sessão Supabase no servidor e encaminhar o JWT em rede privada.
Não usar tokens de serviço como credenciais de usuário.

## Gates antes de integração

1. Revisar as PRs de Prospecção #3/#4/#10 e consolidar as políticas RLS
   por papel. Verificar leitura e escrita como editor e viewer, inclusive
   chamadas diretas à Data API. Não aplicar as migrações concorrentes juntas.
2. Configurar o Supabase exclusivo do FlowBot, sem reutilizar projetos do
   Alvo OS ou Flow. Não provisionar ou migrar recursos nesta PR.
3. Adaptar o BFF existente para sessão Auth verificada, renovação,
   logout, cookies seguros e CSRF. A revogação de sessões e expiração de
   JWT exigem teste real; o vínculo é revalidado a cada operação.
4. R2: adaptar o isolamento RLS do Alvo OS ao banco próprio do motor,
   com papel de execução sem BYPASSRLS, teste de duas organizações e
   ambiente separado. A autorização do HTTP não substitui RLS no banco.
5. R3: compartilhar regras de telefone, documentos e deduplicação;
   distinguir organização usuária, empresa prospectada e workspace.
6. R4: integrar a fonte real da PR #15 visual. Definir carregarEspaco,
   perfis confiáveis e origem independente dos cenários de aprovação.
7. Reusar o contrato da PR #3 do Alvo OS para reality e handoff opcionais.
   Evolution Alvo continua a única infraestrutura de canal.

A aprovação desta API é de autoria em homologação, não publicação. A
separação de autor/revisor e a independência dos cenários precisam de
política e evidência adicionais. Nenhuma permissão de envio ou publicação
é introduzida. Nenhum segredo, deploy ou alteração de banco nesta etapa.

Testes unitários cobrem vínculos, papéis, revogação, erros e origem.
O teste HTTP com Postgres usa um resolvedor injetado; as chamadas Supabase
são simuladas nos testes. CI não demonstra login Supabase real.

Referências oficiais:
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/database/postgres/row-level-security
