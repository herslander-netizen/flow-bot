# flowbot ↔ Alvo Hub: conexão opcional v1

A integração é server-side e desligada por padrão. O produto permanece
independente da Oracle: nunca chamar o Hub dentro do atendimento WhatsApp,
cadastro, autenticação, fluxo publicado, transação de banco ou renderização
obrigatória. Nenhuma chamada automática, retry, cron ou envio de PII.

Configuração de ambiente do servidor (não VITE_, não cliente):
    ALVO_HUB_ENABLED=0
    ALVO_HUB_ORIGIN=<origem HTTPS privada e homologada, sem barra final>
    ALVO_HUB_TOKEN=<segredo único deste produto, aleatório, base64url 43..128>

O token é independente do Supabase, Evolution e do outro produto. Use
verificarAlvoHub(process.env) em diagnóstico administrativo autorizado,
depois de validar sessão e papel no servidor. Não aceitar configuração
vinda de HTTP. Resultado: disabled, unavailable ou ready.
O cliente limita a resposta a 2 KiB, exige contrato exato do produto e
não aceita redirects. Prazo total de 2,5 segundos via AbortSignal.
O endpoint só verifica o núcleo do Hub; ready não implica IA ou agentes
ativos. Nenhuma tarefa pode ser criada por este contrato.

Pré-requisito para ligar: gateway correspondente na Oracle, TLS válido
e caminho de rede privado/autenticado homologado, credenciais distintas,
teste de token trocado, VM desligada, latência, logs sem segredos e
validação de isolamento. O pacote Oracle V2 original ainda não contém
o gateway desta revisão. Sem publicação pública do n8n ou Ollama.

Etapa seguinte: contrato versionado de tarefas com identidade de projeto
e tenant verificadas, idempotência vinculada ao conteúdo, políticas,
filas com limite, auditoria e aprovação. FlowBot não deve usar o
identificador de projeto Flow; cadastrar um projeto próprio antes de
qualquer tarefa real. Dados de contatos, mensagens ou documentos não
entram nesta fase. Não compartilhar bancos ou credenciais.
