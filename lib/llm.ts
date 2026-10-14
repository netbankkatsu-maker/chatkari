import { CHAT_MODEL as XAI_CHAT_MODEL, publicApiError, xaiFetch } from "@/lib/xai";
import { VeniceApiError, veniceFetch, VENICE_CHAT_MODEL } from "@/lib/venice";
export const CHAT_PROVIDER = process.env.CHAT_PROVIDER === "venice" ? "venice" : "xai";
export const CHAT_MODEL = CHAT_PROVIDER === "venice" ? VENICE_CHAT_MODEL : XAI_CHAT_MODEL;
export function chatFetch<T>(path: string, body: unknown, timeoutMs?: number) {
  if (CHAT_PROVIDER !== "venice") return xaiFetch<T>(path, body, timeoutMs);
  if (path !== "/chat/completions" || !body || typeof body !== "object") return veniceFetch<T>(path, body, timeoutMs);
  const payload = body as Record<string, unknown>;
  const thinkingOnly = payload.model === "z-ai-glm-5-3-flash";
  const configuredParameters = payload.venice_parameters && typeof payload.venice_parameters === "object" ? payload.venice_parameters : {};
  return veniceFetch<T>(path, {
    ...payload,
    ...(thinkingOnly ? { max_tokens: Math.max(1024, Number(payload.max_tokens) || 1024) } : {}),
    venice_parameters: {
      include_venice_system_prompt: false,
      enable_web_search: "off",
      strip_thinking_response: true,
      ...(thinkingOnly ? { disable_thinking: false } : {}),
      ...configuredParameters,
    },
  }, timeoutMs);
}
export function publicChatError(error: unknown, fallback: string) {
  if (error instanceof VeniceApiError) {
    if ([401, 403, 503].includes(error.status)) return { status: 503, message: "AIサービスの設定を確認してください。" };
    if (error.status === 402) return { status: 402, message: "Veniceのクレジットが不足しています。残高を確認してください。" };
    if (error.status === 429) return { status: 429, message: "ただいま混み合っています。少し待ってから試してください。" };
    if (error.status === 504) return { status: 504, message: "応答に時間がかかっています。もう一度試してください。" };
    return { status: 500, message: fallback };
  }
  return publicApiError(error, fallback);
}
