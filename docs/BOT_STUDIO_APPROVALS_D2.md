# Bot Studio D2 — aprovação de rascunhos

Esta etapa depende da persistência da PR #19. A migração 0111 acrescenta
registros de aprovação por workspace, ambiente e revisão exata. Não modifica
o publicador, não ativa fluxo nem envia mensagens.

StudioApprovals é um serviço interno para o backend confiável. A identidade
do operador, o ambiente e canApprove devem vir de autorização da sessão,
nunca do corpo da requisição. Ainda não existe endpoint nem autenticação
de usuários integrada a este serviço.

approve exige confirmação explícita e cenários de revisão com asserções
significativas. O motor executa os cenários sobre o documento salvo mais
recente. A aprovação registra revisor, data, revisão e hashes do documento
e da evidência. Esses hashes identificam conteúdo, não são assinaturas.
A origem independente dos cenários deve ser garantida pelo futuro backend
e pelo processo humano; o código não prova autoria humana ou independência
dos cenários. A evidência completa não é persistida nesta etapa.

current retorna aprovação somente para a revisão atual cujo hash confere.
O histórico anterior permanece, mas uma nova edição não herda aprovação.
O serviço compartilha o lock transacional usado por StudioDrafts.

A aprovação não concede autorização de publicação. A futura integração
precisa validar a identidade e as permissões por ação, vincular os testes
independentes à revisão e separar fisicamente os ambientes. O publicador
existente ainda não consulta esta tabela; não ativá-lo com base nesta PR.

Testes PostgreSQL cobrem permissões, confirmação, falhas de simulação,
isolamento, alteração de revisão e ausência de publicação.
Não aplicar a migração em produção durante esta fase.
