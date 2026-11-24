# FlowBot — instruções para agentes de desenvolvimento

## Escopo e arquitetura
- Este repositório é exclusivamente FlowBot. Flow, Alvo OS, Nexus e Evolution Alvo são sistemas separados; não alterá-los sem autorização específica.
- IA auxilia na criação, validação e teste de fluxos. O runtime de atendimento permanece determinístico, sem dependência de modelos ou tokens.
- Priorizar custo zero; não contratar serviços nem ativar APIs pagas.

## Divisão proposta de responsabilidades
| Papel | Agente preferencial | Entrega |
| --- | --- | --- |
| Coordenação e integração | ChatGPT | Ordem de dependências, revisão de evidências e checklist |
| Implementação | Codex | Issue #8, em branch isolada baseada nas dependências verificadas |
| Confiabilidade | Codex ou Claude Code | Issue #9, em branch isolada; evitar editar os mesmos arquivos simultaneamente |
| Revisão independente | Claude Code | Revisar segurança, contratos, concorrência e testes sem alterar branch do autor |
| Operações | OpenClaw | Diagnóstico de ambiente e pareamento, somente quando acesso autorizado estiver disponível |
| Investigação | Hermes | Analisar contratos de webhook, estados ambíguos e cenários de falha |
| Referências | REA | Análise estática de referências autorizadas; sem copiar recursos protegidos |
| Modelos auxiliares | Flow Core | Assistência de autoria e testes com limite de custo zero; fora do runtime |
| Acompanhamento | Jinx | Pendências e evidências, se integração disponível |

Esta tabela é um plano de delegação, não comprova que agentes foram instalados, conectados ou acionados.

## Protocolo
1. Ler README, docs relevantes, issue e alterações pendentes; confirmar a base de trabalho. As issues #8 e #9 dependem das PRs #6 e #7; não presumir que já foram mescladas.
2. Registrar escopo, dependências, branch, arquivos previstos e responsável. Um escritor por área de código; quando houver sobreposição, trabalhar em sequência.
3. Alterações mínimas e reversíveis. Preservar isolamento por workspace, idempotência, contratos e auditabilidade.
4. Executar testes locais disponíveis: npm ci, npm run format:check, npm run lint, npm run typecheck, npm test. Quando aplicável, validar PostgreSQL e cenários de timeout, replay, reinício e handoff.
5. Abrir PR em rascunho com evidências, limitações e revisão independente. Não afirmar que testes passaram sem resultados.
6. Sem merge, deploy, mudanças de credenciais, envio real de mensagens ou pareamento de números já usados por outros projetos sem autorização e verificação explícitas.

## Bloqueios prioritários
- #8: diferenciar mensagens humanas de ecos do bot; não inferir origem quando ambígua.
- #9: impedir avanço da fila durante envio incerto; nunca reenviar com uma nova chave para contornar unknown.
- Pareamento: validar QR e código numérico em instância de teste isolada. Enquanto não houver sessão ativa, usar simulações e fixtures sem dados pessoais.
- Proteger segredos: nunca registrar tokens, números reais, payloads identificáveis ou credenciais no repositório público.
