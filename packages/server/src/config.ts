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
    /** Variável com token PRIVADO do projeto no gateway Evolution Alvo (um por workspace). */
    evolutionTokenEnv: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
    /** Token independente de operação humana; não é a credencial da Evolution. */
    operatorTokenEnv: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
    /** Claude é opcional por tenant; nunca habilitado só porque há chave global. */
    claudeEnabled: z.boolean().optional(),
    /** Segredo de entrada específico da instância, não compartilhado com outros negócios. */
    webhookSecretEnv: z
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
  evolution: { url: string; apiKey: string; webhookSecret: string; provider: "direct" | "alvo" };
  segredoDoAprendizado: string | null;
  diasDeRetencao: number;
  intervaloMs: number;
  workspaces: ConfigDoWorkspace[];
  /** Tokens já lidos do ambiente, por workspace. */
  tokens: Map<string, string>;
  /** Tokens do gateway, carregados apenas no servidor e nunca no JSON de workspaces. */
  tokensEvolution: Map<string, string>;
  /** Tokens de handoff do operador, somente no servidor. */
  tokensOperadores: Map<string, string>;
  /** Segredos de entrada por workspace; nunca expostos ao cliente. */
  webhookSecrets: Map<string, string>;
  claude: {
    enabled: boolean;
    apiKey: string;
    model: string;
    dailyLimit: number;
    maxOutputTokens: number;
  };
};

export class ConfigInvalida extends Error {}

export function carregarConfig(
  env: NodeJS.ProcessEnv,
  arquivoDeWorkspaces: unknown,
): ConfigDoServidor {
  const provider = env["EVOLUTION_PROVIDER"] ?? "direct";
  if (provider !== "direct" && provider !== "alvo")
    throw new ConfigInvalida("EVOLUTION_PROVIDER deve ser direct ou alvo.");
  const faltando = [
    "DATABASE_URL",
    "EVOLUTION_URL",
    ...(provider === "direct" ? ["EVOLUTION_API_KEY"] : []),
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
  const claudeEnabled = env["FLOWBOT_CLAUDE_ENABLED"] === "1";
  if (env["FLOWBOT_CLAUDE_ENABLED"] && !["0", "1"].includes(env["FLOWBOT_CLAUDE_ENABLED"]))
    throw new ConfigInvalida("FLOWBOT_CLAUDE_ENABLED deve ser 0 ou 1.");
  const claudeKey = env["ANTHROPIC_API_KEY"] ?? "";
  const claudeModel = env["FLOWBOT_CLAUDE_MODEL"] ?? "";
  const dailyLimit = Number(env["FLOWBOT_CLAUDE_DAILY_LIMIT"] ?? 5);
  const maxOutputTokens = Number(env["FLOWBOT_CLAUDE_MAX_OUTPUT_TOKENS"] ?? 256);
  if (
    !Number.isInteger(dailyLimit) ||
    dailyLimit < 1 ||
    dailyLimit > 100 ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 64 ||
    maxOutputTokens > 1024
  )
    throw new ConfigInvalida("Limites Claude inválidos.");
  if (claudeEnabled && (!claudeKey || !/^[a-z0-9-]{6,100}$/.test(claudeModel)))
    throw new ConfigInvalida(
      "Para habilitar Claude, defina ANTHROPIC_API_KEY e FLOWBOT_CLAUDE_MODEL.",
    );
  const tokens = new Map<string, string>();
  const tokensEvolution = new Map<string, string>();
  const vistosEvolution = new Set<string>();
  const tokensOperadores = new Map<string, string>();
  const vistosOperadores = new Set<string>();
  const webhookSecrets = new Map<string, string>();
  const vistosWebhooks = new Set<string>();
  for (const w of lista.data.workspaces) {
    if (claudeEnabled && w.claudeEnabled && !w.operatorTokenEnv)
      throw new ConfigInvalida("Claude requer operatorTokenEnv exclusivo para " + w.id);
    if (w.tokenEnv) {
      const valor = env[w.tokenEnv];
      if (!valor)
        throw new ConfigInvalida(`Variável ${w.tokenEnv} (token de ${w.id}) não está definida.`);
      tokens.set(w.id, valor);
    }
    // Cada instância deve ter uma credencial de entrada própria no modo gateway.
    if (provider === "alvo" && !w.webhookSecretEnv)
      throw new ConfigInvalida(`Workspace ${w.id} requer webhookSecretEnv na Evolution Alvo.`);
    if (w.webhookSecretEnv) {
      const valor = env[w.webhookSecretEnv];
      if (!valor || valor.length < 32)
        throw new ConfigInvalida(`Segredo de webhook ${w.webhookSecretEnv} exige 32 caracteres.`);
      if (valor === segredo || vistosWebhooks.has(valor))
        throw new ConfigInvalida("Cada webhook requer segredo próprio, diferente do global.");
      vistosWebhooks.add(valor);
      webhookSecrets.set(w.id, valor);
    }
    if (w.operatorTokenEnv) {
      const tokenOperador = env[w.operatorTokenEnv];
      if (!tokenOperador || tokenOperador.length < 32)
        throw new ConfigInvalida(`Token de operador ${w.operatorTokenEnv} exige 32 caracteres.`);
      if (tokenOperador === segredo || vistosOperadores.has(tokenOperador))
        throw new ConfigInvalida(
          "Token de operador deve ser exclusivo e não pode reutilizar o webhook.",
        );
      vistosOperadores.add(tokenOperador);
      tokensOperadores.set(w.id, tokenOperador);
    }
    if (provider === "alvo") {
      if (!w.evolutionTokenEnv)
        throw new ConfigInvalida(`Workspace ${w.id} requer evolutionTokenEnv no gateway Alvo.`);
      const valor = env[w.evolutionTokenEnv];
      if (!valor) throw new ConfigInvalida(`Variável ${w.evolutionTokenEnv} não está definida.`);
      if (vistosEvolution.has(valor))
        throw new ConfigInvalida("Cada workspace precisa de um token Evolution Alvo exclusivo.");
      vistosEvolution.add(valor);
      tokensEvolution.set(w.id, valor);
    }
  }
  for (const w of lista.data.workspaces) {
    const operador = tokensOperadores.get(w.id);
    const webhook = webhookSecrets.get(w.id);
    const gateway = tokensEvolution.get(w.id);
    const externo = tokens.get(w.id);
    if (
      (operador && (operador === externo || operador === gateway || operador === webhook)) ||
      (webhook && (webhook === externo || webhook === gateway)) ||
      (claudeEnabled && [operador, webhook, gateway, externo, segredo].includes(claudeKey))
    )
      throw new ConfigInvalida(
        "Segredos de webhook, operador, gateway e sistema precisam ser distintos.",
      );
  }
  return {
    porta: Number(env["PORT"] ?? 8080),
    databaseUrl: env["DATABASE_URL"] ?? "",
    evolution: {
      url: env["EVOLUTION_URL"] ?? "",
      apiKey: env["EVOLUTION_API_KEY"] ?? "",
      webhookSecret: segredo,
      provider,
    },
    segredoDoAprendizado: env["FLOW_BOT_SEGREDO"] || null,
    diasDeRetencao: Number(env["FLOW_BOT_RETENCAO_DIAS"] ?? 90),
    intervaloMs: Number(env["FLOW_BOT_INTERVALO_MS"] ?? 2000),
    workspaces: lista.data.workspaces,
    tokens,
    tokensEvolution,
    tokensOperadores,
    webhookSecrets,
    claude: {
      enabled: claudeEnabled,
      apiKey: claudeKey,
      model: claudeModel,
      dailyLimit,
      maxOutputTokens,
    },
  };
}
