// The one place that talks to a language model. Swap providers with LLM_PROVIDER.
import { AnthropicProvider } from "./anthropic-provider";
import { ParserProvider } from "./parser-provider";
import type { ExtractContext, Extraction, LlmProvider } from "./types";

export type { ExtractContext, Extraction, LlmProvider } from "./types";

let cached: LlmProvider | null = null;

export function provider(): LlmProvider {
  if (cached) return cached;
  const choice = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "parser");
  cached =
    choice === "anthropic"
      ? new AnthropicProvider(process.env.LLM_MODEL || "claude-haiku-4-5", process.env.ANTHROPIC_API_KEY)
      : new ParserProvider();
  return cached;
}

/** For tests. */
export function setProvider(p: LlmProvider | null) {
  cached = p;
}

const fallback = new ParserProvider();

/**
 * Draft a task or transaction from free text. If the model fails, the local parser
 * still produces a draft and the error is reported alongside it.
 */
export async function extract(text: string, ctx: ExtractContext): Promise<{ result: Extraction; extractor: string; error: string | null }> {
  const p = provider();
  try {
    return { result: await p.extract(text, ctx), extractor: p.name, error: null };
  } catch (err) {
    if (p.name === fallback.name) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return { result: await fallback.extract(text, ctx), extractor: fallback.name, error: `${p.name}: ${message}` };
  }
}

export const llm = {
  extract,
  extractTask: (text: string, ctx: ExtractContext) => extract(text, { ...ctx, kind: "task" }),
  extractTransaction: (text: string, ctx: ExtractContext) => extract(text, { ...ctx, kind: "transaction" }),
  providerName: () => provider().name,
};
