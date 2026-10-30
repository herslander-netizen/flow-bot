export {
  ArquivoDeWorkspaces,
  carregarConfig,
  ConfigDoWorkspace,
  ConfigInvalida,
  type ConfigDoServidor,
} from "./config.js";
export {
  adaptadorDeSaida,
  filtrarRealidade,
  realidadeDoSistema,
  type Dependencias,
} from "./ligacoes.js";
export { chamarJson, motivoDeUrlInsegura } from "./rede.js";
export { criarServidor, iniciarLacos, type Registro } from "./servidor.js";
