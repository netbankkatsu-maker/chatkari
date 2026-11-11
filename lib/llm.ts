import { spicyChat, publicSpicyError, SPICY_CHAT_MODEL } from "@/lib/spicy";

// All chat traffic goes to SpicyAPI. This module keeps the OpenAI-style
// chat/completions shape that the routes already use.
export const CHAT_PROVIDER = "spicy" as const;
export const CHAT_MODEL = SPICY_CHAT_MODEL;

export async function chatFetch<T>(path: "/chat/completions", body: unknown, timeoutMs = 45_000): Promise<T> {
  void path;
  const payload = body && typeof body === "object" ? { ...(body as Record<string, unknown>) } : {};
  // Keys understood only by the previous providers must not leak to Spicy.
  delete payload.venice_parameters;
  delete payload.store;
  return spicyChat<T>(payload, timeoutMs);
}

export function publicChatError(error: unknown, fallback: string) {
  return publicSpicyError(error, fallback);
}
