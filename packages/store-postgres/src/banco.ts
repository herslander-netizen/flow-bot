/**
 * Acesso ao Postgres: transação com cliente dedicado e aplicação das migrações (só acréscimo, registradas em
 * `flow_bot.migrations`).
 */
import { readdirSync, readFileSync } from "node:fs";

import type { Pool, PoolClient } from "pg";

export type Cliente = Pick<PoolClient, "query">;

export async function emTransacao<T>(pool: Pool, fn: (c: Cliente) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const r = await fn(cliente);
    await cliente.query("COMMIT");
    return r;
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

const PASTA = new URL("../migrations/", import.meta.url);

/** Aplica as migrações que faltam, em ordem, cada uma na sua transação. Devolve as aplicadas agora. */
export async function migrar(pool: Pool): Promise<string[]> {
  await pool.query(
    "CREATE SCHEMA IF NOT EXISTS flow_bot; CREATE TABLE IF NOT EXISTS flow_bot.migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const aplicadas = new Set(
    (await pool.query<{ name: string }>("SELECT name FROM flow_bot.migrations")).rows.map(
      (r) => r.name,
    ),
  );
  const novas: string[] = [];
  for (const arquivo of readdirSync(PASTA)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (aplicadas.has(arquivo)) continue;
    const sql = readFileSync(new URL(arquivo, PASTA), "utf8");
    await emTransacao(pool, async (c) => {
      // Trava para dois processos não aplicarem a mesma migração ao mesmo tempo.
      await c.query("SELECT pg_advisory_xact_lock(hashtext('flow_bot.migrations'))");
      const ja = await c.query("SELECT 1 FROM flow_bot.migrations WHERE name = $1", [arquivo]);
      if (ja.rowCount) return;
      await c.query(sql);
      await c.query("INSERT INTO flow_bot.migrations (name) VALUES ($1)", [arquivo]);
      novas.push(arquivo);
    });
  }
  return novas;
}
