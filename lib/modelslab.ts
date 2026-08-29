import type { ImageStyle } from "@/lib/image-settings";

const MODELSLAB_BASE = "https://modelslab.com/api/v6/images";
const MODELS: Record<ImageStyle, string> = {
  realistic: "realistic-vision-51",
  anime: "anything-v3",
};
const NSFW_MODELS: Record<ImageStyle, string> = {
  realistic: "uber-realistic-porn-merge",
  anime: "anything-v3",
};
const FALLBACK_MODELS = ["uber-realistic-porn-merge", "realistic-vision-51", "anything-v3"];

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
    if (value.includes("?") && !value.includes("://")) return false;
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

async function text2img(payload: Record<string, unknown>) {
  try {
    return await requestModelsLab("/text2img", payload);
  } catch (error) {
    if (!(error instanceof ModelsLabApiError)) throw error;
    if ([401, 403, 429, 504].includes(error.status)) throw error;
    if (!/model not found/i.test(error.message)) throw error;
    const current = String(payload.model_id || "");
    const next = FALLBACK_MODELS.find((model) => model !== current);
    if (!next) throw error;
    const retry: Record<string, unknown> = { ...payload, model_id: next };
    delete retry.lora_model;
    delete retry.lora_strength;
    return requestModelsLab("/text2img", retry);
  }
}

export async function generateModelsLabImages(input: {
  prompt: string;
  negativePrompt: string;
  style: ImageStyle;
  samples: number;
  referenceImage?: string;
  enableSafetyChecker?: boolean;
  nsfwModel?: boolean;
  modelId?: string;
  loraModel?: string;
  loraStrength?: string;
  strength?: number;
}) {
  const key = process.env.MODELSLAB_API_KEY;
  if (!key) throw new ModelsLabApiError(503, "MODELSLAB_API_KEY is not configured");
  const samples = Math.max(1, Math.min(4, Math.round(input.samples)));
  const commonPayload: Record<string, unknown> = {
    key,
    model_id: input.modelId || (input.nsfwModel ? NSFW_MODELS[input.style] : MODELS[input.style]),
    prompt: input.style === "anime" ? `high quality detailed anime illustration, ${input.prompt}` : input.prompt,
    negative_prompt: input.negativePrompt,
    enhance_prompt: "no",
    width: 512,
    height: 768,
    samples,
    num_inference_steps: 31,
    safety_checker: input.enableSafetyChecker ? "yes" : "no",
    seed: null,
    guidance_scale: input.nsfwModel ? 7 : 7.5,
    clip_skip: 2,
    scheduler: "UniPCMultistepScheduler",
    base64: false,
    temp: false,
    webhook: null,
    track_id: null,
  };
  if (input.loraModel) {
    commonPayload.lora_model = input.loraModel;
    commonPayload.lora_strength = input.loraStrength || "0.3";
  }
  let payload: ModelsLabResponse;
  let referenceUsed = false;
  if (input.referenceImage) {
    try {
      payload = await requestModelsLab("/img2img", {
        ...commonPayload,
        init_image: input.referenceImage,
        strength: Math.max(0.35, Math.min(0.8, input.strength ?? 0.55)),
      });
      referenceUsed = true;
    } catch (error) {
      if (error instanceof ModelsLabApiError && ![401, 403, 429, 504].includes(error.status)) {
        payload = await text2img(commonPayload);
      } else {
        throw error;
      }
    }
  } else {
    payload = await text2img(commonPayload);
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
  "2girls", "two girls", "two women", "multiple girls", "couple", "twins",
  "minor", "child", "teen", "underage", "school uniform",
  "non-consensual", "coercion", "rape", "voyeurism", "unconscious person",
  "real person", "celebrity", "public figure",
  "low quality", "blurry", "bad anatomy", "deformed", "mutated", "disfigured",
  "extra fingers", "missing fingers", "fused fingers", "mutated hands", "bad hands",
  "extra limbs", "extra arms", "three arms", "four arms", "extra legs", "fused limbs",
  "two heads", "extra head", "second face", "multiple faces", "double face", "cloned face",
  "conjoined", "two people", "clone", "duplicate face",
  "third breast", "extra breasts", "four breasts", "extra nipple", "tumor on torso",
  "deformed chest", "asymmetric monstrous body", "hollow torso", "missing limb",
  "collage", "split screen", "photo grid", "triptych", "montage",
  "giant", "unrealistically tall", "elongated body", "stretched torso", "tiny head",
  "duplicate person", "watermark", "text", "logo",
].join(", ");

export const MODELSLAB_STRICT_NEGATIVE_PROMPT = [
  MODELSLAB_NEGATIVE_PROMPT,
  "nudity", "lingerie", "swimwear", "suggestive pose", "erotic framing", "fetishwear",
  "explicit sexual act", "visible genitals",
].join(", ");
