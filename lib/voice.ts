import type { Character } from "@/data/characters";

export type CharacterVoiceProfile = {
  voiceId: string;
  speed: number;
  label: string;
  delivery: "bright" | "warm" | "soft" | "calm" | "confident" | "commanding";
};

const fixedVoices: Record<string, CharacterVoiceProfile> = {
  misaki: { voiceId: "iris", speed: 1.08, label: "明るく人懐っこい声", delivery: "bright" },
  mayu: { voiceId: "luna", speed: 0.93, label: "穏やかで包み込む声", delivery: "warm" },
  ayaka: { voiceId: "eve", speed: 1.1, label: "元気でよく笑う声", delivery: "bright" },
  rena: { voiceId: "atlas", speed: 0.96, label: "落ち着いた主導的な声", delivery: "commanding" },
  chinatsu: { voiceId: "helios", speed: 1.12, label: "華やかでテンポのよい声", delivery: "bright" },
  saori: { voiceId: "carina", speed: 0.9, label: "優しく癒やす年上の声", delivery: "warm" },
  yui: { voiceId: "aurora", speed: 0.91, label: "控えめで柔らかな声", delivery: "soft" },
  mai: { voiceId: "rex", speed: 1.04, label: "率直で歯切れのよい声", delivery: "confident" },
  kaori: { voiceId: "ursa", speed: 1.02, label: "親しみのある温かな声", delivery: "warm" },
  nanako: { voiceId: "liora", speed: 0.88, label: "静かでミステリアスな声", delivery: "calm" },
  rika: { voiceId: "rigel", speed: 0.96, label: "知的で毅然とした声", delivery: "confident" },
  yukie: { voiceId: "ursa", speed: 1.03, label: "温かく明るい岡山寄りの声", delivery: "warm" },
};

const generatedVoicePool = ["carina", "luna", "iris", "altair", "celeste", "aurora", "liora", "sirius", "ursa"];

function stableIndex(value: string, length: number) {
  let hash = 0;
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % length;
}

export function characterVoiceProfile(character: Character): CharacterVoiceProfile {
  const fixed = fixedVoices[character.id];
  if (fixed) return fixed;

  const traits = `${character.personality.join(" ")} ${character.speakingStyle} ${character.romanceStyle}`;
  if (/(S気質|主導権|命令|強気|威圧)/.test(traits)) return { voiceId: "atlas", speed: 0.96, label: "自信のある主導的な声", delivery: "commanding" };
  if (/(人見知り|おとなしい|控えめ|奥手|恥ずかし)/.test(traits)) return { voiceId: "aurora", speed: 0.91, label: "控えめで柔らかな声", delivery: "soft" };
  if (/(穏やか|包容力|癒|優しい|聞き上手)/.test(traits)) return { voiceId: "carina", speed: 0.92, label: "穏やかで温かな声", delivery: "warm" };
  if (/(落ち着|ミステリアス|淡白|静か)/.test(traits)) return { voiceId: "liora", speed: 0.9, label: "静かで落ち着いた声", delivery: "calm" };
  if (/(サバサバ|率直|はっきり|しっかり|真面目)/.test(traits)) return { voiceId: "rigel", speed: 1.01, label: "明瞭で自信のある声", delivery: "confident" };
  if (/(明るい|社交的|元気|よく笑う|ノリ)/.test(traits)) return { voiceId: "iris", speed: 1.09, label: "明るく親しみやすい声", delivery: "bright" };

  return {
    voiceId: generatedVoicePool[stableIndex(character.id, generatedVoicePool.length)],
    speed: character.age >= 35 ? 0.95 : character.age <= 24 ? 1.06 : 1,
    label: "プロフィールに合わせた自然な声",
    delivery: character.age >= 35 ? "warm" : "bright",
  };
}

function cleanForSpeech(text: string) {
  return text
    .replace(/[☺️😂🙈🥺💕💗✨😅😊😉😳😭😏]/gu, "")
    .replace(/ｗｗ+|www+/gi, "[chuckle]")
    .replace(/笑(?=$|[。、！？!?\s])/g, "[chuckle]")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function voiceTextFor(character: Character, text: string) {
  const profile = characterVoiceProfile(character);
  let spoken = cleanForSpeech(text).slice(0, 1200);
  if (!spoken) spoken = "うん。";

  if (profile.delivery === "soft") spoken = `<soft>${spoken}</soft>`;
  if (profile.delivery === "calm") spoken = `<slow>${spoken}</slow>`;
  if (profile.delivery === "commanding") spoken = `<lower-pitch>${spoken}</lower-pitch>`;
  if (profile.delivery === "bright" && /[!！]|ほんと|嬉し|楽し/.test(spoken) && !spoken.includes("[chuckle]")) {
    spoken = `${spoken} [chuckle]`;
  }

  return { profile, spoken };
}
