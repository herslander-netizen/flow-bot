/**
 * Configuração do serviço. Senhas só por variável de ambiente; a lista de negócios (workspaces) num arquivo JSON
 * sem segredo nenhum (os tokens de cada sistema também vêm do ambiente, pelo nome da variável).
 */
import { z } from "zod";

const UrlHttp = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//.test(u), "Use http(s).");

export const ConfigDoWorkspace = z
  .object({
    /** Identificador do negócio no Flow Bot (ex.: o id do negócio no seu sistema). */
    id: z.string().min(1).max(120),
    /** Nome da instância na Evolution que atende este negócio. */
    instance: z.string().min(1).max(120),
    /** Fluxo publicado que atende conversas novas. */
    flowId: z.string().min(1).max(80),
    /** Endereço do seu sistema que devolve o retrato da realidade (GET, JSON). */
    realityUrl: UrlHttp.optional(),
    /** Endereço do seu sistema avisado quando a conversa vai para a equipe (POST, JSON). */
    handoffUrl: UrlHttp.optional(),
    /** Nome da variável de ambiente com o token enviado ao seu sistema (Authorization: Bearer). */
    tokenEnv: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
    /** Credencial exclusiva para autorizar a retomada de conversas deste workspace. */
    resumeTokenEnv: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
  })
  .strict();

export const ArquivoDeWorkspaces = z
  .object({ workspaces: z.array(ConfigDoWorkspace).min(1).max(1000) })
  .strict()
  .superRefine((a, ctx) => {
    const vistos = new Set<string>();
    for (const w of a.workspaces) {
      if (vistos.has(w.instance))
        ctx.addIssue({ code: "custom", message: `Instância repetida: ${w.instance}` });
      vistos.add(w.instance);
    }
  });

export type ConfigDoWorkspace = z.infer<typeof ConfigDoWorkspace>;

export type ConfigDoServidor = {
  porta: number;
  databaseUrl: string;
  evolution: { url: string; apiKey: string; webhookSecret: string };
  segredoDoAprendizado: string | null;
  diasDeRetencao: number;
  intervaloMs: number;
  workspaces: ConfigDoWorkspace[];
  /** Tokens usados nas chamadas ao sistema hospedeiro, por workspace. */
  tokens: Map<string, string>;
  /** Credenciais de entrada para a operação de retomada, independentes dos tokens de saída. */
  resumeTokens: Map<string, string>;
};

export class ConfigInvalida extends Error {}

export function carregarConfig(
  env: NodeJS.ProcessEnv,
  arquivoDeWorkspaces: unknown,
): ConfigDoServidor {
  const faltando = [
    "DATABASE_URL",
    "EVOLUTION_URL",
    "EVOLUTION_API_KEY",
    "EVOLUTION_WEBHOOK_SECRET",
  ].filter((k) => !env[k]);
  if (faltando.length)
    throw new ConfigInvalida(`Faltam variáveis de ambiente: ${faltando.join(", ")}`);
  const segredo = env["EVOLUTION_WEBHOOK_SECRET"] ?? "";
  if (segredo.length < 32)
    throw new ConfigInvalida("EVOLUTION_WEBHOOK_SECRET precisa de pelo menos 32 caracteres.");
  const lista = ArquivoDeWorkspaces.safeParse(arquivoDeWorkspaces);
  if (!lista.success)
    throw new ConfigInvalida(
      `Arquivo de workspaces inválido: ${lista.error.issues.map((i) => i.message).join("; ")}`,
    );
  const tokens = new Map<string, string>();
  const resumeTokens = new Map<string, string>();
  for (const w of lista.data.workspaces) {
    if (!w.tokenEnv) continue;
    const valor = env[w.tokenEnv];
    if (!valor)
      throw new ConfigInvalida(`Variável ${w.tokenEnv} (token de ${w.id}) não está definida.`);
    tokens.set(w.id, valor);
  }
  for (const w of lista.data.workspaces) {
    if (!w.resumeTokenEnv) continue;
    const valor = env[w.resumeTokenEnv];
    if (!valor)
      throw new ConfigInvalida(
        `Variável ${w.resumeTokenEnv} (token de retomada de ${w.id}) não está definida.`,
      );
    resumeTokens.set(w.id, valor);
  }
  return {
    porta: Number(env["PORT"] ?? 8080),
    databaseUrl: env["DATABASE_URL"] ?? "",
    evolution: {
      url: env["EVOLUTION_URL"] ?? "",
      apiKey: env["EVOLUTION_API_KEY"] ?? "",
      webhookSecret: segredo,
    },
    segredoDoAprendizado: env["FLOW_BOT_SEGREDO"] || null,
    diasDeRetencao: Number(env["FLOW_BOT_RETENCAO_DIAS"] ?? 90),
    intervaloMs: Number(env["FLOW_BOT_INTERVALO_MS"] ?? 2000),
    workspaces: lista.data.workspaces,
    tokens,
    resumeTokens,
  };
}
