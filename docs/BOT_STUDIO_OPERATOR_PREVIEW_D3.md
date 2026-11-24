# Bot Studio D3 — sessão de operador e gateway de homologação

Esta etapa adiciona uma autenticação local de homologação. Não substitui
um provedor de identidade de produção. A sessão é opaca, expira em 30 minutos
e é revogada no logout ou reinício do processo. O armazenamento em memória
é limitado. A verificação usa scrypt e comparação constante; não guarda
senhas em texto puro. Há limite global de tentativas e concorrência.

## Contrato para a interface

Usar chamadas de mesma origem, com cookies, sem Authorization de serviço.

- POST /studio/session: username e password em JSON.
- GET /studio/session: identidade e ambiente da sessão, ou 401.
- DELETE /studio/session: encerra sessão e remove cookie.
- Rotas de autoria: mesmas operações de BOT_STUDIO_API_D3.md.

O cookie exige HTTPS, HttpOnly, Secure e SameSite=Strict. Escritas exigem
Origin exato. O gateway não encaminha cabeçalhos de autorização do navegador.
O token privado de cada operador é enviado somente ao motor em loopback.
Nenhuma rota de publicação ou WhatsApp é encaminhada.

## Execução controlada

O script packages/server/bin/studio-preview.mjs usa o build existente.
Configurar STUDIO_PREVIEW_DATABASE_URL (banco descartável separado),
STUDIO_PREVIEW_CONFIG (arquivo privado de operadores) e STUDIO_PREVIEW_ORIGIN
(origem HTTPS da interface, sem barra final).

Cada operador possui username, workspaceId, actorId, environment (test ou
staging), salt hexadecimal (16 a 64 bytes), passwordHash hexadecimal (64 bytes
derivados com scrypt padrão do Node), serviceToken aleatório exclusivo de
alta entropia e permissions (read, write, simulate, approve). Não incluir
segredos em commits, navegador, documentação ou logs.

Com as migrações já aplicadas exclusivamente ao banco descartável,
executar npm run build e node packages/server/bin/studio-preview.mjs.
O script não executa migrações e não conecta à Evolution. API privada
em 127.0.0.1:4175 e gateway em 127.0.0.1:4176. O proxy HTTPS de homologação
deve servir a interface e encaminhar apenas /studio/session e /studio/v1
ao gateway. Não encaminhar a porta da API privada.

## Antes da publicação

- Homologar testes e verificar segregação física do banco e dos segredos.
- Configurar HTTPS, limite de requisições e proteção de rede no proxy.
- Escolher identidade definitiva, MFA, revogação e auditoria de sessão.
- Garantir origem independente dos cenários e separação de revisão humana.
- Integrar a fonte de dados da interface sem alterar o visual do Claude.
- Publicador continua desativado neste serviço.

A PR não cria credenciais, recursos de nuvem ou prévia pública. O script
é preparado para homologação; execução real depende de ambiente autorizado.
