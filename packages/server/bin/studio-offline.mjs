#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import process from "node:process";

import { avaliarRascunhoStudio } from "../dist/studio-offline.js";

const [path, ...extra] = process.argv.slice(2);
let result;
try {
  if (!path || extra.length || !statSync(path).isFile() || statSync(path).size > 1024 * 1024)
    throw new Error("entrada_invalida");
  const input = JSON.parse(readFileSync(path, "utf8"));
  result = avaliarRascunhoStudio(input);
} catch {
  result = { ok: false, error: "entrada_invalida", approved: false, published: false };
}
console.log(JSON.stringify(result));
process.exitCode = !result.ok ? 1 : result.scenariosPassed ? 0 : 2;
