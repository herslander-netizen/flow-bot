export { lerAvisoDaEvolution, textoDaMensagem, type EntradaDaEvolution } from "./entrada.js";
export {
  configurarWebhook,
  enviarTexto,
  textoParaOCliente,
  type ConfigDaEvolution,
  type ResultadoDoEnvio,
} from "./saida.js";

export { enviarTextoViaGatewayAlvo, consultarConexaoGatewayAlvo, type ConfigDoGatewayAlvo, type ResultadoDoGatewayAlvo } from "./gateway-alvo.js";
