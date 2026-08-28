import { sanitizeCharacter, type Character } from "@/data/characters";
import { CHAT_MODEL, publicApiError, xaiFetch } from "@/lib/xai";

type GeneratedCharacter = Omit<Character, "id" | "accent">;
type CharacterCompletion = { choices?: Array<{ message?: { content?: string } }> };

const palette = ["#f06d8b", "#6d8db8", "#a276a8", "#df8a55", "#4f9b88", "#8674b5", "#b2766a", "#607d91", "#ce7194", "#7d9762"];

const characterSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    characters: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          age: { type: "integer" },
          job: { type: "string" },
          maritalStatus: { type: "string" },
          introduction: { type: "string" },
          personality: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
          hobbies: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
          romanceStyle: { type: "string" },
          speakingStyle: { type: "string" },
          appearance: { type: "string" },
          fashion: { type: "string" },
          firstMessage: { type: "string" },
          imagePrompt: { type: "string" },
          profileNote: { type: "string" },
          adultTopicPolicy: { type: "string", enum: ["open", "reject"] },
          imageRequestStyle: { type: "string", enum: ["never", "playful", "dominant"] },
        },
        required: ["name", "age", "job", "maritalStatus", "introduction", "personality", "hobbies", "romanceStyle", "speakingStyle", "appearance", "fashion", "firstMessage", "imagePrompt", "profileNote", "adultTopicPolicy", "imageRequestStyle"],
      },
    },
  },
  required: ["characters"],
} as const;

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      ageMin?: number;
      ageMax?: number;
      personality?: string;
      relationshipStyle?: string;
      adultPreference?: string;
      count?: number;
    };
    const ageMin = Math.max(18, Math.min(70, Math.round(Number(body.ageMin) || 20)));
    const ageMax = Math.max(ageMin, Math.min(75, Math.round(Number(body.ageMax) || 40)));
    const count = Math.max(1, Math.min(10, Math.round(Number(body.count) || 5)));
    const preference = {
      personality: String(body.personality || "おまかせ").slice(0, 200),
      relationshipStyle: String(body.relationshipStyle || "自然に距離を縮める").slice(0, 200),
      adultPreference: String(body.adultPreference || "特になし").slice(0, 300),
    };

    const result = await xaiFetch<CharacterCompletion>("/chat/completions", {
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: "日本のマッチングアプリ向けに、完全な架空の成人女性キャラクターを設計します。全員18歳以上で、互いに名前・職業・性格・口調・外見が重複しないよう多様にしてください。成人向けの好みは、成人同士・同意のある合法的な範囲だけを性格設定へ反映し、未成年や非同意の要素は含めません。imagePromptは写実的なプロフィール写真を生成できる英語で書き、各人物で撮影場所、時間帯、構図、カメラ角度、髪型、服装、光、色調を明確に変えてください。白いスタジオ背景とベージュの服へ偏らせず、ひと目で別人・別シーンだと分かる設計にしてください。",
        },
        {
          role: "user",
          content: `${count}人作成してください。年齢は${ageMin}〜${ageMax}歳。希望する性格: ${preference.personality}。関係性・距離感: ${preference.relationshipStyle}。成人同士の好み・性癖: ${preference.adultPreference}。初回メッセージは短い自然な日本語にしてください。`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "matching_characters", strict: true, schema: characterSchema },
      },
      store: false,
      temperature: 0.9,
      max_tokens: 6000,
    }, 60_000);

    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("Missing generated characters");
    const parsed = JSON.parse(content) as { characters?: GeneratedCharacter[] };
    const stamp = Date.now();
    const generated = (parsed.characters || []).slice(0, count).flatMap((item, index) => {
      const character = sanitizeCharacter({ ...item, id: `custom-${stamp}-${index}`, accent: palette[index % palette.length] });
      return character ? [character] : [];
    });
    if (!generated.length) throw new Error("Invalid generated characters");
    return Response.json({ characters: generated });
  } catch (error) {
    const response = publicApiError(error, "キャラクター生成に失敗しました。もう一度試してください。");
    return Response.json({ error: response.message }, { status: response.status });
  }
}
