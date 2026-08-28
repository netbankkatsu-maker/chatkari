import { publicApiError, XaiApiError, XAI_API_BASE } from "@/lib/xai";

const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = /^(audio\/(webm|mp4|mpeg|ogg|wav|x-wav|aac|flac)|video\/webm)/i;
const ALLOWED_AUDIO_NAMES = /\.(webm|mp4|m4a|mp3|mpeg|ogg|opus|wav|aac|flac)$/i;

type TranscriptionResult = { text?: string; duration?: number; error?: { message?: string } | string };

export async function POST(request: Request) {
  try {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new XaiApiError(503, "XAI_API_KEY is not configured");

    const incoming = await request.formData();
    const audio = incoming.get("audio");
    const recognizedAudio = audio instanceof File && (ALLOWED_AUDIO_TYPES.test(audio.type) || (audio.type === "application/octet-stream" && ALLOWED_AUDIO_NAMES.test(audio.name)));
    if (!(audio instanceof File) || !recognizedAudio || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
      return Response.json({ error: "ボイスメッセージは45秒以内・6MB以下で録音してください。" }, { status: 400 });
    }

    const form = new FormData();
    form.append("format", "true");
    form.append("language", "ja");
    form.append("filler_words", "false");
    form.append("file", audio, audio.name || "voice-message.webm");

    const response = await fetch(`${XAI_API_BASE}/stt`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    const data = await response.json().catch(() => null) as TranscriptionResult | null;
    if (!response.ok) {
      const detail = typeof data?.error === "string" ? data.error : data?.error?.message;
      throw new XaiApiError(response.status, detail || `xAI returned ${response.status}`);
    }
    const transcript = data?.text?.trim();
    if (!transcript) return Response.json({ error: "声を聞き取れませんでした。もう一度録音してください。" }, { status: 422 });
    return Response.json({ transcript: transcript.slice(0, 1000), duration: data?.duration });
  } catch (error) {
    const response = publicApiError(error, "ボイスメッセージを聞き取れませんでした。もう一度試してください。");
    return Response.json({ error: response.message }, { status: response.status });
  }
}
