import { resolveCharacter } from "@/data/characters";
import { publicSpicyError, spicyTextToSpeech, SpicyApiError } from "@/lib/spicy";
import { voiceTextFor } from "@/lib/voice";

export async function POST(request: Request) {
  try {
    if (!process.env.SPICY_API_KEY) throw new SpicyApiError(503, "SPICY_API_KEY is not configured");

    const body = await request.json() as { characterId?: string; character?: unknown; text?: string };
    const character = resolveCharacter(body.characterId, body.character);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!character) return Response.json({ error: "キャラクターが見つかりません。" }, { status: 400 });
    if (!text || text.length > 1200) return Response.json({ error: "音声にする文章が長すぎます。" }, { status: 400 });

    const { profile, spoken } = voiceTextFor(character, text);
    const { audio, contentType } = await spicyTextToSpeech({
      text: spoken,
      voiceId: profile.voiceId,
      language: "ja",
      speed: profile.speed,
    });
    if (!audio.byteLength) throw new SpicyApiError(502, "Spicy returned empty audio");
    return new Response(audio, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Character-Voice": encodeURIComponent(profile.label),
      },
    });
  } catch (error) {
    const response = publicSpicyError(error, "ボイスメッセージの生成に失敗しました。もう一度試してください。");
    return Response.json({ error: response.message }, { status: response.status });
  }
}
