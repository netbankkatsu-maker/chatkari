import sharp from "sharp";

export const VENICE_API_BASE = "https://api.venice.ai/api/v1";
export const VENICE_CHAT_MODEL = process.env.VENICE_CHAT_MODEL || "z-ai-glm-5-3-flash";
export const VENICE_IMAGE_MODEL = process.env.VENICE_IMAGE_MODEL || "krea-v2-medium";

type VeniceErrorPayload = { error?: { message?: string } | string; details?: unknown };

export class VeniceApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "VeniceApiError";
  }
}

async function veniceRequest<T>(
  path: string,
  { method = "POST", body, timeoutMs = 45_000 }: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) throw new VeniceApiError(503, "VENICE_API_KEY is not configured");

  let response: Response;
  try {
    response = await fetch(`${VENICE_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new VeniceApiError(504, "Venice request timed out");
    throw new VeniceApiError(502, "Could not reach Venice");
  }

  if (response.ok && path === "/image/generate" && response.headers.get("x-venice-is-blurred") === "true") throw new VeniceApiError(422, "Venice filtered the image");
  const payload = (await response.json().catch(() => null)) as T | VeniceErrorPayload | null;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "error" in payload
      ? typeof payload.error === "string" ? payload.error : payload.error?.message
      : undefined;
    const validation = payload && typeof payload === "object" && "details" in payload ? JSON.stringify(payload.details) : "";
    throw new VeniceApiError(response.status, [detail || `Venice returned ${response.status}`, validation].filter(Boolean).join(" "));
  }
  if (!payload) throw new VeniceApiError(502, "Venice returned an invalid response");
  return payload as T;
}

export const veniceFetch = <T>(path: string, body: unknown, timeoutMs?: number) =>
  veniceRequest<T>(path, { body, timeoutMs });

export const veniceGet = <T>(path: string, timeoutMs?: number) =>
  veniceRequest<T>(path, { method: "GET", timeoutMs });

function toDataUrls(images: unknown, variants: number) {
  if (!Array.isArray(images)) return [];
  return images
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .slice(0, variants)
    .map((b64) => (b64.startsWith("data:image/") ? b64 : `data:image/webp;base64,${b64}`));
}

export async function generateVeniceImages(input: {
  prompt: string;
  negativePrompt?: string;
  samples?: number;
  referenceImage?: string;
  width?: number;
  height?: number;
  style?: "realistic" | "anime";
  safetyLevel?: "standard" | "strict";
}) {
  const count = Number(input.samples);
  const variants = Number.isFinite(count) ? Math.max(1, Math.min(4, Math.round(count))) : 1;
  const deadline = Date.now() + 110_000;
  const common: Record<string, unknown> = {
    model: VENICE_IMAGE_MODEL,
    prompt: input.style === "anime" ? `${input.prompt}\nAnime illustration, drawn art, not a photograph.` : input.prompt,
    negative_prompt: input.negativePrompt || "",
    format: "webp",
    variants,
    safe_mode: input.safetyLevel === "strict",
    embed_exif_metadata: false,
    return_binary: false,
  };
  let referenceUsed = Boolean(input.referenceImage);
  let pixelSizing = false;

  // Only retry rejected optional parameters. Never retry billing, authentication,
  // rate-limit, timeout, safety, or server failures that may incur another charge.
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new VeniceApiError(504, "Venice request timed out");
    const body = {
      ...common,
      ...(pixelSizing ? { width: input.width || 768, height: input.height || 1024 } : { aspect_ratio: "2:3" }),
      ...(referenceUsed ? { style_references: [{ image: input.referenceImage, strength: 0.5 }] } : {}),
    };
    try {
      const result = await veniceRequest<{ images?: unknown }>("/image/generate", { body, timeoutMs: remaining });
      const urls = toDataUrls(result.images, variants);
      if (!urls.length) throw new VeniceApiError(502, "Venice returned no image");
      for (const url of urls) await assertVisibleImage(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
      return { urls, referenceUsed };
    } catch (error) {
      if (!(error instanceof VeniceApiError) || ![400, 422].includes(error.status)) throw error;
      if (referenceUsed && /style[_ ]references?.*(?:unsupported|not supported|not allowed|invalid)|(?:unsupported|not supported|not allowed|invalid).*style[_ ]references?/i.test(error.message)) {
        referenceUsed = false;
      } else if (!pixelSizing && /aspect[_ ]ratio|width|height/i.test(error.message)) {
        pixelSizing = true;
      } else {
        throw error;
      }
      if (attempt === 2) throw error;
    }
  }
  throw new VeniceApiError(502, "Venice image generation failed");
}

export const VENICE_IMAGE_EDIT_MODEL = process.env.VENICE_IMAGE_EDIT_MODEL || "qwen-image-2-edit";

async function assertVisibleImage(bytes: Buffer) {
  const stats = await sharp(bytes).removeAlpha().stats();
  if (stats.channels.every((channel) => channel.max <= 8 || (channel.mean < 2 && channel.stdev < 4))) {
    throw new VeniceApiError(422, "Venice returned a blank black image");
  }
}

export async function editVeniceProfilePhoto(input: { prompt: string; referenceImage: string; samples: number; safetyLevel: "standard" | "strict" }) {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) throw new VeniceApiError(503, "VENICE_API_KEY is not configured");
  const deadline = Date.now() + 90_000;
  const urls: string[] = [];
  const image = input.referenceImage.startsWith("data:image/") ? input.referenceImage.slice(input.referenceImage.indexOf(",") + 1) : input.referenceImage;
  for (let index = 0; index < Math.max(1, Math.min(4, input.samples)); index++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new VeniceApiError(504, "Venice request timed out");
    const response = await fetch(`${VENICE_API_BASE}/image/edit`, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: VENICE_IMAGE_EDIT_MODEL, prompt: input.prompt, image, output_format: "webp", safe_mode: input.safetyLevel === "strict", aspect_ratio: "2:3" }),
      signal: AbortSignal.timeout(remaining), cache: "no-store",
    }).catch((error: unknown) => { throw new VeniceApiError(error instanceof Error && error.name === "TimeoutError" ? 504 : 502, "Venice image edit failed"); });
    if (!response.ok) throw new VeniceApiError(response.status, `Venice image edit returned ${response.status}`);
    if (response.headers.get("x-venice-is-blurred") === "true") throw new VeniceApiError(422, "Venice filtered the image");
    if (!response.headers.get("content-type")?.startsWith("image/")) throw new VeniceApiError(502, "Venice returned an invalid image");
    const bytes = Buffer.from(await response.arrayBuffer());
    await assertVisibleImage(bytes);
    const stored = await sharp(bytes).resize({ width: 900, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    urls.push(`data:image/webp;base64,${stored.toString("base64")}`);
  }
  return { urls, referenceUsed: true, model: VENICE_IMAGE_EDIT_MODEL };
}
