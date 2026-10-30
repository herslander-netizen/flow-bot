// Regrava schema/flow-bot-v0.schema.json a partir do schema zod compilado (o teste falha se o arquivo ficar desatualizado).
import { writeFileSync } from "node:fs";

import { esquemaJsonDoFluxo, esquemaJsonDoPerfil } from "../dist/json-schema.js";

const destino = new URL("../schema/flow-bot-v0.schema.json", import.meta.url);
writeFileSync(destino, JSON.stringify(esquemaJsonDoFluxo(), null, 2) + "\n");
console.log("schema gravado em", destino.pathname);

const perfil = new URL("../schema/reality-profile-v1.schema.json", import.meta.url);
writeFileSync(perfil, JSON.stringify(esquemaJsonDoPerfil(), null, 2) + "\n");
console.log("schema gravado em", perfil.pathname);
