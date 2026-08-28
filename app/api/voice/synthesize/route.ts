import { resolveCharacter } from "@/data/characters";
import { publicApiError, XaiApiError, XAI_API_BASE } from "@/lib/xai";
import { voiceTextFor } from "@/lib/voice";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new XaiApiError(503, "XAI_API_KEY is not configured");

    const body = await request.json() as { characterId?: string; character?: unknown; text?: string };
    const character = resolveCharacter(body.characterId, body.character);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!character) return Response.json({ error: "キャラクターが見つかりません。" }, { status: 400 });
    if (!text || text.length > 1200) return Response.json({ error: "音声にする文章が長すぎます。" }, { status: 400 });

    const { profile, spoken } = voiceTextFor(character, text);
    const response = await fetch(`${XAI_API_BASE}/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: spoken,
        voice_id: profile.voiceId,
        language: "ja",
        speed: profile.speed,
        output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 64000 },
        text_normalization: true,
      }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { message?: string } | string } | null;
      const detail = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
      throw new XaiApiError(response.status, detail || `xAI returned ${response.status}`);
    }

    const audio = await response.arrayBuffer();
    if (!audio.byteLength) throw new XaiApiError(502, "xAI returned empty audio");
    return new Response(audio, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Character-Voice": encodeURIComponent(profile.label),
      },
    });
  } catch (error) {
    const response = publicApiError(error, "ボイスメッセージの生成に失敗しました。もう一度試してください。");
    return Response.json({ error: response.message }, { status: response.status });
  }
}
