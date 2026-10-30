export {
  casarCuringa,
  corresponder,
  similaridade,
  type ResultadoDaCorrespondencia,
} from "./correspondencia.js";
export { processar, TETO_ABSOLUTO_DE_PASSOS } from "./motor.js";
export { normalizar } from "./normalizar.js";
export { compilar, FluxoInvalido, type NoDoPlano, type Plano } from "./plano.js";
export {
  novaSessao,
  type Acao,
  type Contato,
  type Evento,
  type Passo,
  type Resultado,
  type Sessao,
  type StatusDaSessao,
  type Valor,
} from "./sessao.js";
export { escolherPorPeso, sorteioComSemente, type Sorteio } from "./sorteio.js";
export { preencher, valorDaVariavel } from "./variaveis.js";
