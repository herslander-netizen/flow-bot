export {
  CATALOGO,
  ConfigDeCorrespondencia,
  ModoDeCorrespondencia,
  TIPOS_DE_NO,
  ehTipoConhecido,
  portasDoNo,
  type EspecDeNo,
  type Porta,
  type TipoDeNo,
} from "./catalog.js";
export {
  Aresta,
  DeclaracaoDeVariavel,
  DocumentoDeFluxo,
  No,
  PadroesDoFluxo,
  SCHEMA_VERSION,
} from "./flow.js";
export {
  problemaDoPadrao,
  TAMANHO_MAXIMO_DO_PADRAO,
  type ProblemaDoPadrao,
} from "./regex-segura.js";
export { esquemaJsonDoFluxo } from "./json-schema.js";
export {
  VARIAVEIS_DO_SISTEMA,
  ehVariavelDoSistema,
  nomeDeVariavelValido,
  placeholdersDoTexto,
} from "./variables.js";
export {
  validarFluxo,
  type CodigoDoProblema,
  type Problema,
  type ResultadoDaValidacao,
} from "./validate.js";
