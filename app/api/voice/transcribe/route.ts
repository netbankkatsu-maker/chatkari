import { publicSpicyError, spicySpeechToText, SpicyApiError } from "@/lib/spicy";

const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = /^(audio\/(webm|mp4|mpeg|ogg|wav|x-wav|aac|flac)|video\/webm)/i;
const ALLOWED_AUDIO_NAMES = /\.(webm|mp4|m4a|mp3|mpeg|ogg|opus|wav|aac|flac)$/i;

export async function POST(request: Request) {
  try {
    if (!process.env.SPICY_API_KEY) throw new SpicyApiError(503, "SPICY_API_KEY is not configured");

    const incoming = await request.formData();
    const audio = incoming.get("audio");
    const recognizedAudio = audio instanceof File && (ALLOWED_AUDIO_TYPES.test(audio.type) || (audio.type === "application/octet-stream" && ALLOWED_AUDIO_NAMES.test(audio.name)));
    if (!(audio instanceof File) || !recognizedAudio || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
      return Response.json({ error: "ボイスメッセージは45秒以内・6MB以下で録音してください。" }, { status: 400 });
    }

    const result = await spicySpeechToText({
      audio: Buffer.from(await audio.arrayBuffer()),
      filename: audio.name || "voice-message.webm",
      contentType: audio.type || "audio/webm",
      language: "ja",
    });
    const transcript = result.text.trim();
    if (!transcript) return Response.json({ error: "声を聞き取れませんでした。もう一度録音してください。" }, { status: 422 });
    return Response.json({ transcript: transcript.slice(0, 1000), duration: result.duration });
  } catch (error) {
    const response = publicSpicyError(error, "ボイスメッセージを聞き取れませんでした。もう一度試してください。");
    return Response.json({ error: response.message }, { status: response.status });
  }
}
