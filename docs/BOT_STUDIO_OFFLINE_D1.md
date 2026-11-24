# Bot Studio — ponte offline D1

Base: PR #15 deste motor. Interface correspondente: flowbot PR #11, em outro repositório.

A ponte reutiliza `validarFluxo`, `compilar` e `simular`. Ela não inicia servidor HTTP,
não chama a Evolution, não consulta IA ou banco, não grava versões e não publica.

## Execução local

Após `npm ci` e `npm run build`, execute:

    node packages/server/bin/studio-offline.mjs entrada.json

O arquivo JSON (até 1 MiB) contém:

- `draft`: documento completo flow-bot/v0 com status draft;
- `base` (opcional): versão do mesmo fluxo, para comparação;
- `scenarios`: objeto ArquivoDeCenarios do runtime, até 20 cenários de 20 passos cada;
- `perfil` (opcional): PerfilDeRealidade válido.

A saída JSON contém `ok`, `mode`, `approved:false`, `published:false`; em caso de
sucesso, `diff`, `reports` e `scenariosPassed`. O diff usa JSON Pointer, preserva
a ordem de arrays, e usa null para representar valores ausentes. A base é fornecida
pelo operador e não constitui prova de uma publicação existente. Exit codes: 0
cenários passaram, 1 entrada/validação falhou, 2 ao menos um cenário falhou.

Use apenas dados sintéticos durante a homologação. O resultado da simulação não
prova revisão independente nem autorização de publicação.

## Limites e próximos gates

1. Revisar testes e CI; o adaptador da interface ainda não foi conectado.
2. Identidade de workspace derivada de sessão autenticada, nunca de dados enviados
   pelo navegador. Backend/BFF próprio, sem tokens de operador no JavaScript.
3. Persistência por workspace e ambiente, revisão otimista e trilha de auditoria.
   Revisão independente vinculada ao hash do rascunho; edição invalida aprovação.
4. Endpoint autenticado de simulação e comparação; substituir gradualmente a
   simulação visual, mantendo indicação explícita de demonstração.
5. Provedor de autoria opcional atrás do validador existente, com quota e custo
   verificados; nenhuma chamada no runtime. Agentes externos não recebem
   permissões de publicação.
6. Publicação separada e autorizada; homologação em ambiente isolado. WhatsApp
   permanece desligado até autorização e teste do piloto.

Não adicionar novas instâncias Evolution, segredos ou recursos pagos nesta fase.
