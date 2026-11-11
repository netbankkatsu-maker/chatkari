import sharp from "sharp";

// SpicyAPI (https://api.spicyapi.ai) is the single provider for chat, image,
// voice (TTS/STT) and billing in this app. All calls happen server-side only.

export const SPICY_API_BASE = "https://api.spicyapi.ai/api/v1";
export const SPICY_CHAT_BASE = "https://api.spicyapi.ai/v1";
export const SPICY_CHAT_MODEL = process.env.SPICY_CHAT_MODEL || "zai/glm-5.3-flash/chat";
export const SPICY_IMAGE_MODEL = process.env.SPICY_IMAGE_MODEL || "";
export const SPICY_TTS_MODEL = process.env.SPICY_TTS_MODEL || "xai/grok-tts/text-to-speech";
export const SPICY_STT_MODEL = process.env.SPICY_STT_MODEL || "xai/grok-stt/speech-to-text";

export class SpicyApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "SpicyApiError";
  }
}

function requireApiKey() {
  const apiKey = process.env.SPICY_API_KEY;
  if (!apiKey) throw new SpicyApiError(503, "SPICY_API_KEY is not configured");
  return apiKey;
}

type Envelope<T> = { code?: number; msg?: string; data?: T };

export async function spicyApi<T>(path: string, { method = "GET", body, timeoutMs = 30_000 }: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const apiKey = requireApiKey();
  let response: Response;
  try {
    response = await fetch(`${SPICY_API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new SpicyApiError(504, "Spicy request timed out");
    throw new SpicyApiError(502, "Could not reach Spicy");
  }
  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !payload || payload.code !== 200) {
    throw new SpicyApiError(response.ok ? 502 : response.status, payload?.msg || `Spicy returned ${response.status}`);
  }
  return payload.data as T;
}

export async function spicyChat<T>(payload: unknown, timeoutMs = 45_000): Promise<T> {
  const apiKey = requireApiKey();
  let response: Response;
  try {
    response = await fetch(`${SPICY_CHAT_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new SpicyApiError(504, "Spicy chat request timed out");
    throw new SpicyApiError(502, "Could not reach Spicy");
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: { message?: string } | string }) | null;
  if (!response.ok) {
    const detail = typeof data?.error === "string" ? data.error : data?.error?.message;
    throw new SpicyApiError(response.status, detail || `Spicy returned ${response.status}`);
  }
  if (!data) throw new SpicyApiError(502, "Spicy returned an invalid response");
  return data as T;
}

export function publicSpicyError(error: unknown, fallback: string) {
  if (error instanceof SpicyApiError) {
    if ([401, 403, 503].includes(error.status)) return { status: 503, message: "AIサービスの設定を確認してください。" };
    if (error.status === 402) return { status: 402, message: "Spicyのクレジットが不足しています。残高を確認してください。" };
    if (error.status === 429) return { status: 429, message: "ただいま混み合っています。少し待ってから試してください。" };
    if (error.status === 504) return { status: 504, message: "応答に時間がかかっています。もう一度試してください。" };
  }
  return { status: 500, message: fallback };
}

// ---------------------------------------------------------------------------
// Models and image jobs
// ---------------------------------------------------------------------------

type SchemaProperty = {
  type?: string;
  enum?: Array<string | number>;
  default?: unknown;
  maxLength?: number;
  maxItems?: number;
  minItems?: number;
  minimum?: number;
  maximum?: number;
};

export type SpicyModel = {
  model: string;
  displayName?: string;
  enabled?: boolean;
  available?: boolean;
  policyTier?: string;
  startingPrice?: { price?: string; unit?: string };
  quantityField?: string;
  inputSchema?: { properties?: Record<string, SchemaProperty>; required?: string[] };
};

export const getSpicyModel = (id: string) => spicyApi<SpicyModel>(`/models/${id.split("/").map(encodeURIComponent).join("/")}`);

async function listImageModels() {
  const data = await spicyApi<{ items: SpicyModel[] }>("/models?modality=image&task=text-to-image&includeSchema=1");
  return data.items || [];
}

const REFERENCE_FIELDS = ["reference_image_urls", "reference_image_url", "control_image_url", "image_urls", "image_url"];

function imageSpec(model: SpicyModel) {
  const properties = model.inputSchema?.properties || {};
  const required = model.inputSchema?.required || [];
  const referenceField = REFERENCE_FIELDS.find((name) => properties[name]);
  const referenceSchema = referenceField ? properties[referenceField] : undefined;
  const capacity = referenceSchema?.type === "array" ? Math.min(referenceSchema.maxItems ?? 1, 16) : referenceSchema ? 1 : 0;
  const minimum = referenceField && required.includes(referenceField) ? Math.max(1, referenceSchema?.minItems ?? 1) : 0;
  const supportedFields = new Set(["prompt", "negative_prompt", "aspect_ratio", "resolution", "seed", "n", "num_outputs", ...REFERENCE_FIELDS]);
  const supported = !!model.inputSchema && !!properties.prompt && required.every((name) => supportedFields.has(name) || properties[name]?.default !== undefined);
  return { referenceField, capacity, minimum, supported, acceptsWithoutReferences: minimum === 0 };
}

function priceOf(model: SpicyModel) {
  const price = Number(model.startingPrice?.price);
  return Number.isFinite(price) ? price : Infinity;
}

export function pickSpicyImageModel(models: SpicyModel[], needsReference: boolean): SpicyModel | undefined {
  const usable = models.filter((m) => m.enabled && m.available && !m.model.endsWith("/edit") && !m.model.endsWith("/chat"));
  const byPreference = (a: SpicyModel, b: SpicyModel) => Number(b.policyTier === "unrestricted") - Number(a.policyTier === "unrestricted") || priceOf(a) - priceOf(b);
  if (needsReference) {
    const withReference = usable.filter((m) => { const spec = imageSpec(m); return spec.supported && spec.capacity >= 1; }).sort(byPreference);
    if (withReference.length) return withReference[0];
  }
  return usable.filter((m) => { const spec = imageSpec(m); return spec.supported && spec.acceptsWithoutReferences; }).sort(byPreference)[0];
}

function buildImageInput(model: SpicyModel, input: { prompt: string; negativePrompt?: string; aspectRatio?: string; references?: string[] }) {
  const properties = model.inputSchema?.properties || {};
  const spec = imageSpec(model);
  if (!spec.supported) throw new SpicyApiError(400, "この画像モデルには対応していません。");
  const refs = input.references || [];
  if (refs.length > spec.capacity) throw new SpicyApiError(400, "参考画像の枚数がモデルの上限を超えています。");
  const output: Record<string, unknown> = { prompt: input.prompt };
  if (properties.negative_prompt && input.negativePrompt) output.negative_prompt = input.negativePrompt;
  if (spec.referenceField && refs.length) {
    output[spec.referenceField] = properties[spec.referenceField].type === "array" ? refs : refs[0];
  }
  const aspectEnum = properties.aspect_ratio?.enum?.map(String) || [];
  if (aspectEnum.length) {
    const wanted = input.aspectRatio || "2:3";
    const fallback = ["2:3", "3:4", "4:5", "1:1"].find((value) => aspectEnum.includes(value)) || aspectEnum[0];
    output.aspect_ratio = aspectEnum.includes(wanted) ? wanted : fallback;
  }
  const resolutionEnum = properties.resolution?.enum?.map(String) || [];
  if (resolutionEnum.length) output.resolution = resolutionEnum.includes("1k") ? "1k" : resolutionEnum[0];
  for (const [name, field] of Object.entries(properties)) {
    if (output[name] === undefined && field.default !== undefined) output[name] = field.default;
  }
  const quantity = model.quantityField || (properties.num_outputs ? "num_outputs" : "n");
  if (properties[quantity]) output[quantity] = 1;
  for (const name of model.inputSchema?.required || []) {
    if (output[name] === undefined) throw new SpicyApiError(400, `このモデルには追加設定「${name}」が必要です。`);
  }
  return output;
}

type SpicyTask = {
  taskId: string;
  model: string;
  state: string;
  errorMessage?: string;
  output?: { assets?: Array<{ url?: string; mime?: string; pending?: boolean; unavailable?: boolean }> } & Record<string, unknown>;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runSpicyJob(model: string, input: Record<string, unknown>, deadlineMs: number): Promise<SpicyTask> {
  const created = await spicyApi<{ taskId: string }>("/jobs/createTask", { method: "POST", body: { model, input }, timeoutMs: 30_000 });
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const task = await spicyApi<SpicyTask>(`/jobs/recordInfo?taskId=${encodeURIComponent(created.taskId)}`, { timeoutMs: 20_000 });
    if (task.state === "succeeded") {
      if (task.output?.assets?.some((asset) => asset.pending)) {
        if (Date.now() > deadline) throw new SpicyApiError(504, "Spicy job timed out");
        await wait(2500);
        continue;
      }
      return task;
    }
    if (task.state === "failed" || task.state === "cancelled" || task.state === "canceled") {
      throw new SpicyApiError(502, task.errorMessage || "Spicy job failed");
    }
    if (Date.now() > deadline) throw new SpicyApiError(504, "Spicy job timed out");
    await wait(2500);
  }
}

// ---------------------------------------------------------------------------
// File uploads (for data-URL references and voice recordings)
// ---------------------------------------------------------------------------

export async function uploadSpicyFile(bytes: Buffer, contentType: string): Promise<string> {
  const ticket = await spicyApi<{ fileId: string; uploadUrl: string; headers?: Record<string, string>; method?: string }>("/common/upload-url", {
    method: "POST",
    body: { contentType, bytes: bytes.byteLength },
    timeoutMs: 30_000,
  });
  const put = await fetch(ticket.uploadUrl, {
    method: ticket.method || "PUT",
    headers: ticket.headers || {},
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!put?.ok) throw new SpicyApiError(502, "Spicy file upload failed");
  const committed = await spicyApi<{ uri: string }>(`/files/${encodeURIComponent(ticket.fileId)}/commit`, { method: "POST", timeoutMs: 30_000 });
  return committed.uri;
}

const DATA_IMAGE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function resolveSpicyReference(referenceImage: string): Promise<string> {
  const match = DATA_IMAGE.exec(referenceImage);
  if (!match) return referenceImage;
  return uploadSpicyFile(Buffer.from(match[2], "base64"), match[1]);
}

// ---------------------------------------------------------------------------
// Image generation (returns webp data URLs, like the previous Venice flow)
// ---------------------------------------------------------------------------

async function assertVisibleImage(bytes: Buffer) {
  const stats = await sharp(bytes).removeAlpha().stats();
  if (stats.channels.every((channel) => channel.max <= 8 || (channel.mean < 2 && channel.stdev < 4))) {
    throw new SpicyApiError(422, "Spicy returned a blank black image");
  }
}

async function downloadAsDataUrl(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" }).catch(() => null);
  if (!response?.ok) throw new SpicyApiError(502, "生成画像の取得に失敗しました。");
  const bytes = Buffer.from(await response.arrayBuffer());
  await assertVisibleImage(bytes);
  const stored = await sharp(bytes).resize({ width: 900, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  return `data:image/webp;base64,${stored.toString("base64")}`;
}

export async function generateSpicyImages(input: {
  prompt: string;
  negativePrompt?: string;
  samples?: number;
  referenceImage?: string;
  aspectRatio?: string;
  style?: "realistic" | "anime";
  deadlineMs?: number;
}): Promise<{ urls: string[]; referenceUsed: boolean; model: string }> {
  const variants = Math.max(1, Math.min(4, Math.round(Number(input.samples) || 1)));
  const deadlineMs = input.deadlineMs ?? 110_000;
  const reference = input.referenceImage ? await resolveSpicyReference(input.referenceImage) : undefined;
  let model: SpicyModel | undefined;
  if (SPICY_IMAGE_MODEL) {
    model = await getSpicyModel(SPICY_IMAGE_MODEL);
  } else {
    model = pickSpicyImageModel(await listImageModels(), Boolean(reference));
  }
  if (!model || !model.enabled || !model.available) throw new SpicyApiError(503, "利用できる画像モデルがありません。");
  const prompt = input.style === "anime" ? `${input.prompt}\nAnime illustration, drawn art, not a photograph.` : input.prompt;
  const jobInput = buildImageInput(model, {
    prompt,
    negativePrompt: input.negativePrompt,
    aspectRatio: input.aspectRatio,
    references: reference ? [reference] : [],
  });
  const urls: string[] = [];
  const perJob = Math.max(30_000, Math.floor(deadlineMs / variants));
  for (let index = 0; index < variants; index++) {
    const task = await runSpicyJob(model.model, jobInput, perJob);
    const asset = task.output?.assets?.find((entry) => entry.url && !entry.unavailable);
    if (!asset?.url) throw new SpicyApiError(502, "Spicy returned no image");
    urls.push(await downloadAsDataUrl(asset.url));
  }
  return { urls, referenceUsed: Boolean(reference), model: model.model };
}

export async function editSpicyProfilePhoto(input: { prompt: string; referenceImage: string; samples: number }) {
  const generated = await generateSpicyImages({
    prompt: input.prompt,
    samples: input.samples,
    referenceImage: input.referenceImage,
    aspectRatio: "2:3",
    deadlineMs: 90_000,
  });
  return { urls: generated.urls, referenceUsed: true, model: generated.model };
}

// ---------------------------------------------------------------------------
// Voice (TTS / STT via audio models on the jobs API)
// ---------------------------------------------------------------------------

function fillFromSchema(model: SpicyModel, values: Record<string, unknown>, candidates: Record<string, string[]>) {
  const properties = model.inputSchema?.properties || {};
  const input: Record<string, unknown> = {};
  for (const [field, names] of Object.entries(candidates)) {
    const value = values[field];
    if (value === undefined) continue;
    const property = names.find((name) => properties[name]);
    if (property) input[property] = value;
  }
  for (const [name, field] of Object.entries(properties)) {
    if (input[name] === undefined && field.default !== undefined) input[name] = field.default;
  }
  for (const name of model.inputSchema?.required || []) {
    if (input[name] === undefined) throw new SpicyApiError(400, `音声モデルには追加設定「${name}」が必要です。`);
  }
  return input;
}

export async function spicyTextToSpeech(input: { text: string; voiceId: string; language: string; speed: number }): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const model = await getSpicyModel(SPICY_TTS_MODEL);
  const jobInput = fillFromSchema(model, {
    text: input.text,
    voice: input.voiceId,
    language: input.language,
    speed: input.speed,
  }, {
    text: ["text", "prompt", "input"],
    voice: ["voice_id", "voice", "voiceId"],
    language: ["language", "lang", "locale"],
    speed: ["speed", "speed_ratio"],
  });
  const properties = model.inputSchema?.properties || {};
  if (properties.output_format && jobInput.output_format === undefined) jobInput.output_format = { codec: "mp3", sample_rate: 24000, bit_rate: 64000 };
  const task = await runSpicyJob(SPICY_TTS_MODEL, jobInput, 60_000);
  const asset = task.output?.assets?.find((entry) => entry.url && !entry.unavailable);
  if (!asset?.url) throw new SpicyApiError(502, "Spicy returned no audio");
  const response = await fetch(asset.url, { signal: AbortSignal.timeout(30_000), cache: "no-store" }).catch(() => null);
  if (!response?.ok) throw new SpicyApiError(502, "音声の取得に失敗しました。");
  return { audio: await response.arrayBuffer(), contentType: response.headers.get("Content-Type") || asset.mime || "audio/mpeg" };
}

export async function spicySpeechToText(input: { audio: Buffer; filename: string; contentType: string; language: string }): Promise<{ text: string; duration?: number }> {
  const uri = await uploadSpicyFile(input.audio, input.contentType || "audio/webm");
  const model = await getSpicyModel(SPICY_STT_MODEL);
  const jobInput = fillFromSchema(model, {
    audio: uri,
    language: input.language,
  }, {
    audio: ["audio_url", "audio", "file_url", "file", "audio_file", "input", "url"],
    language: ["language", "lang", "locale"],
  });
  const task = await runSpicyJob(SPICY_STT_MODEL, jobInput, 60_000);
  const output = (task.output || {}) as Record<string, unknown>;
  const direct = [output.text, output.transcript, output.result].find((value) => typeof value === "string" && value.trim());
  if (typeof direct === "string") return { text: direct.trim(), duration: typeof output.duration === "number" ? output.duration : undefined };
  const asset = task.output?.assets?.find((entry) => entry.url && !entry.unavailable);
  if (asset?.url) {
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(30_000), cache: "no-store" }).catch(() => null);
    if (response?.ok) {
      const raw = await response.text();
      try {
        const parsed = JSON.parse(raw) as { text?: string; transcript?: string; duration?: number };
        const text = (parsed.text || parsed.transcript || "").trim();
        if (text) return { text, duration: parsed.duration };
      } catch {
        if (raw.trim()) return { text: raw.trim() };
      }
    }
  }
  throw new SpicyApiError(502, "Spicy returned no transcript");
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export async function spicyCredit() {
  return spicyApi<{ available: string; held: string; total: string }>("/chat/credit", { timeoutMs: 15_000 });
}

export const SPICY_NEGATIVE_PROMPT = [
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

export const SPICY_STRICT_NEGATIVE_PROMPT = [
  SPICY_NEGATIVE_PROMPT,
  "nudity", "lingerie", "swimwear", "suggestive pose", "erotic framing", "fetishwear",
  "explicit sexual act", "visible genitals",
].join(", ");
