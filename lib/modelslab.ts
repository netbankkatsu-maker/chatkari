import type { ImageStyle } from "@/lib/image-settings";

const MODELSLAB_BASE = "https://modelslab.com/api/v6/images";
const MODELS: Record<ImageStyle, string> = {
  realistic: "realistic-vision-51",
  anime: "anything-v3",
};

type ModelsLabResponse = {
  status?: string;
  id?: string | number;
  output?: string[];
  proxy_links?: string[];
  message?: string;
  eta?: number;
};

export class ModelsLabApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ModelsLabApiError";
  }
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function validOutputUrls(payload: ModelsLabResponse) {
  return [...(payload.output || []), ...(payload.proxy_links || [])].filter((value, index, all) => {
    if (typeof value !== "string" || all.indexOf(value) !== index) return false;
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  });
}

async function requestModelsLab(path: string, body: unknown, timeoutMs = 95_000) {
  const response = await fetch(`${MODELSLAB_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  }).catch((error: unknown) => {
    if (error instanceof Error && error.name === "TimeoutError") throw new ModelsLabApiError(504, "ModelsLab request timed out");
    throw new ModelsLabApiError(502, "Could not reach ModelsLab");
  });
  const payload = await response.json().catch(() => null) as ModelsLabResponse | null;
  if (!response.ok || !payload) throw new ModelsLabApiError(response.status || 502, payload?.message || `ModelsLab returned ${response.status}`);
  if (payload.status === "error") throw new ModelsLabApiError(502, payload.message || "ModelsLab generation failed");
  return payload;
}

export async function generateModelsLabImages(input: {
  prompt: string;
  negativePrompt: string;
  style: ImageStyle;
  samples: number;
  referenceImage?: string;
}) {
  const key = process.env.MODELSLAB_API_KEY;
  if (!key) throw new ModelsLabApiError(503, "MODELSLAB_API_KEY is not configured");
  const samples = Math.max(1, Math.min(4, Math.round(input.samples)));
  const commonPayload = {
    key,
    model_id: MODELS[input.style],
    prompt: input.style === "anime" ? `high quality detailed anime illustration, ${input.prompt}` : input.prompt,
    negative_prompt: input.negativePrompt,
    enhance_prompt: "yes",
    width: 768,
    height: 1024,
    samples,
    num_inference_steps: 28,
    safety_checker: "no",
    seed: null,
    guidance_scale: 7.5,
    clip_skip: 2,
    scheduler: "UniPCMultistepScheduler",
    base64: false,
    temp: false,
    webhook: null,
    track_id: null,
  };
  let payload: ModelsLabResponse;
  let referenceUsed = false;
  if (input.referenceImage) {
    try {
      payload = await requestModelsLab("/img2img", {
        ...commonPayload,
        init_image: input.referenceImage,
        strength: 0.62,
      });
      referenceUsed = true;
    } catch (error) {
      if (error instanceof ModelsLabApiError && ![401, 403, 429, 504].includes(error.status)) {
        payload = await requestModelsLab("/text2img", commonPayload);
      } else {
        throw error;
      }
    }
  } else {
    payload = await requestModelsLab("/text2img", commonPayload);
  }
  let urls = validOutputUrls(payload).slice(0, samples);
  if (urls.length) return { urls, referenceUsed };
  if (!payload.id) throw new ModelsLabApiError(502, payload.message || "ModelsLab returned no image");

  for (let attempt = 0; attempt < 18; attempt += 1) {
    await wait(Math.min(2500 + attempt * 250, 5000));
    const fetched = await requestModelsLab("/fetch", { key, request_id: String(payload.id) }, 20_000);
    urls = validOutputUrls(fetched).slice(0, samples);
    if (urls.length) return { urls, referenceUsed };
    if (fetched.status === "error" || fetched.status === "failed") throw new ModelsLabApiError(502, fetched.message || "ModelsLab generation failed");
  }
  throw new ModelsLabApiError(504, "ModelsLab generation timed out");
}

export const MODELSLAB_NEGATIVE_PROMPT = [
  "minor", "child", "teen", "underage", "young-looking", "school uniform",
  "non-consensual", "coercion", "rape", "voyeurism", "unconscious person",
  "explicit sexual act", "visible genitals", "real person", "celebrity", "public figure",
  "low quality", "blurry", "bad anatomy", "deformed", "extra fingers", "extra limbs",
  "duplicate person", "watermark", "text", "logo",
].join(", ");
