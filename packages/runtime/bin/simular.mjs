#!/usr/bin/env node
// Roda cenários de conversa contra um fluxo, sem canal e sem enviar nada.
// Uso: npm run simular -- <fluxo.json> <cenarios.json> [perfil-de-realidade.json]
// Com o perfil, os fatos do fluxo são conferidos e os cenários partem do retrato de exemplo do perfil.
import { readFileSync } from "node:fs";
import process from "node:process";

import { PerfilDeRealidade, realidadeDeExemplo } from "@flow-bot/contracts";

import { ArquivoDeCenarios, compilar, FluxoInvalido, simular } from "../dist/index.js";

const [arquivoDoFluxo, arquivoDeCenarios, arquivoDoPerfil] = process.argv.slice(2);
if (!arquivoDoFluxo || !arquivoDeCenarios) {
  console.error("Uso: npm run simular -- <fluxo.json> <cenarios.json> [perfil-de-realidade.json]");
  process.exit(2);
}

const perfil = arquivoDoPerfil
  ? PerfilDeRealidade.parse(JSON.parse(readFileSync(arquivoDoPerfil, "utf8")))
  : null;

let plano;
try {
  plano = compilar(
    JSON.parse(readFileSync(arquivoDoFluxo, "utf8")),
    perfil ? { perfis: [perfil] } : {},
  );
} catch (erro) {
  if (erro instanceof FluxoInvalido) {
    console.error("Fluxo inválido:");
    for (const p of erro.problemas) console.error(`  ${p.code}  ${p.path}  ${p.message}`);
    process.exit(1);
  }
  throw erro;
}

const cenarios = ArquivoDeCenarios.parse(JSON.parse(readFileSync(arquivoDeCenarios, "utf8")));
let falhas = 0;
for (const cenario of cenarios.scenarios) {
  const r = simular(plano, cenario, perfil ? { realidade: realidadeDeExemplo(perfil) } : {});
  console.log(`\n${r.ok ? "✔" : "✘"} ${r.name}`);
  for (const p of r.passos) {
    console.log(`  ${p.entrada}`);
    for (const s of p.saidas) console.log(`    < ${s.replace(/\n/g, "\n      ")}`);
    console.log(`    [${p.status} · ${p.motivo}]`);
    for (const f of p.falhas) console.log(`    ✘ ${f}`);
  }
  if (!r.ok) falhas++;
}
console.log(
  `\n${cenarios.scenarios.length - falhas}/${cenarios.scenarios.length} cenários passaram.`,
);
process.exit(falhas ? 1 : 0);
