export const XAI_API_BASE = "https://api.x.ai/v1";
export const CHAT_MODEL = "grok-4.20-non-reasoning";
export const IMAGE_MODEL = "grok-imagine-image-2.0";

type XaiErrorPayload = { error?: { message?: string } | string };

export class XaiApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function xaiFetch<T>(path: string, body: unknown, timeoutMs = 45_000): Promise<T> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new XaiApiError(503, "XAI_API_KEY is not configured");

  let response: Response;
  try {
    response = await fetch(`${XAI_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new XaiApiError(504, "xAI request timed out");
    }
    throw new XaiApiError(502, "Could not reach xAI");
  }

  const payload = (await response.json().catch(() => null)) as T | XaiErrorPayload | null;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "error" in payload
      ? typeof payload.error === "string" ? payload.error : payload.error?.message
      : undefined;
    throw new XaiApiError(response.status, detail || `xAI returned ${response.status}`);
  }
  if (!payload) throw new XaiApiError(502, "xAI returned an invalid response");
  return payload as T;
}

export function publicApiError(error: unknown, fallback: string) {
  if (error instanceof XaiApiError) {
    if (error.status === 401 || error.status === 403) return { status: 503, message: "AIサービスの設定を確認してください。" };
    if (error.status === 429) return { status: 429, message: "ただいま混み合っています。少し待ってから試してください。" };
    if (error.status === 504) return { status: 504, message: "応答に時間がかかっています。もう一度試してください。" };
  }
  return { status: 500, message: fallback };
}
