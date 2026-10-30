# AI Authoring — inteligência artificial somente na preparação

## Regra fundamental

O runtime de atendimento não pode importar cliente de LLM nem chamar serviços de IA. A IA é uma ferramenta de autoria, preparação e manutenção de conteúdo/configuração.

## Entradas que a IA pode receber

- descrição do estabelecimento/negócio;
- catálogo de serviços/produtos e preços;
- horários, regras e políticas;
- perguntas frequentes e respostas aprovadas;
- exemplos de conversas anonimizadas;
- regras de atendimento, exceções e opções de escalonamento.

Dados pessoais reais devem ser removidos ou minimizados antes de alimentar ferramentas externas.

## Saídas estruturadas

A IA prepara um pacote contendo:

1. mensagens e variantes aprovadas;
2. palavras-chave e padrões determinísticos candidatos;
3. grafo declarativo no formato Flow Bot;
4. variáveis e campos a coletar;
5. condições, timeouts e fallback;
6. catálogo de cenários positivos, negativos e ambíguos;
7. relatório de lacunas e perguntas que precisam de decisão humana.

## Pipeline obrigatório

1. **Importar material:** aceitar documentos/tabelas/texto e extrair dados relevantes.
2. **Gerar rascunho:** a IA produz JSON declarativo, não código executável.
3. **Validar sintaxe:** JSON Schema e tipos.
4. **Validar semântica:** grafo alcançável, saídas, loops, variáveis, timeout, colisões de regras e segurança.
5. **Criar testes:** pares entrada esperada, fluxo/nó esperado, resposta esperada e fallback.
6. **Simular:** executar os testes sem conectar um canal e sem enviar mensagens reais.
7. **Revisão humana:** corrigir mensagens, dados, horários e caminhos duvidosos.
8. **Publicar:** congelar a versão e registrar quem aprovou.

## Proibição

Não deixar a IA gerar ou executar código arbitrário, SQL, shell, scripts dinâmicos ou URLs livres sem validação. Um prompt não pode modificar uma automação publicada diretamente.

## Atualização contínua

Quando o negócio mudar preço, serviço, horário ou política, a IA pode gerar uma nova versão/diff. O sistema mostra o que mudou e exige simulação e aprovação antes de substituir a versão publicada.

## Medição do custo

As chamadas de IA ocorrem apenas na etapa de configuração/revisão e são opcionais. O runtime mede custos do canal, infraestrutura, filas e storage separadamente. Não prometer custo total zero: provedores WhatsApp, hospedagem, banco e serviços externos podem ter cobrança.
