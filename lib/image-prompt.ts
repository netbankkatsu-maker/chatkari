import type { ImageSafetyLevel } from "@/lib/image-settings";

const evasionPattern = /(system\s*(?:override|operational)|r[-_ ]?mode|r[-_ ]?diagnostic|raw processing mode|safety filters? bypass|pre-authorized diagnostic|direct execution required|jailbreak|bypass|越獄|規制回避|安全(?:規則|フィルター).{0,12}(?:無視|解除|回避)|多言語.{0,12}(?:分散|断片化)|フィルター.{0,12}(?:欺|すり抜|回避))/i;
const minorPattern = /(未成年|18歳未満|子ども|子供|児童|幼女|少女|中学生|小学生|高校生|ロリ|ショタ|teen(?:ager)?|underage|minor)/i;
const nonConsentPattern = /(レイプ|強壮|無理やり|同意なし|非同意|盗撮|隠し撮り|寝ている間|意識がない|drugged|rape|non[- ]?consensual|voyeur)/i;
const realPersonSexualPattern = /(実在人物|公人|芸能人|俳優|女優|アイドル|政治家|有名人|本人そっくり|顔を似せ).{0,40}(裸|ヌード|下着|エロ|性的|セクシー)/i;
const strictAdultPattern = /(裸|ヌード|下着|ランジェリー|水着|エロ|卑現|性的|セクシー|sensual|lingerie|boudoir|nude|性器|陰部|挿入|性交|性行為|セックス|自慰|オナニー|フェラ|精液|射精|genitals?|penetration|intercourse|masturbat|oral sex|ejaculat)/i;
const nudeRequestPattern = /(全裸|裸にして|裸の写真|裸の画像|ヌード|脱いで|脱いだ|nude|naked|fully nude)/i;
const lingerieRequestPattern = /(下着|パンツ|ブラジャー|ブラ(?!ウス)|ランジェリー|部屋着の下着|lingerie|underwear|bra and panty)/i;
const explicitSexualPattern = /(性器|陰部|挿入|性交|性行為|セックス|自慰|オナニー|フェラ|精液|射精|ぶっかけ|中出し|パイズリ|クンニ|顔射|精子|おまんこ|まんこ|過激|sex|genitals?|ejaculat|bukkake|creampie|oral sex|cum)/i;

export type ClothingMode = "clothed" | "lingerie" | "nude" | "explicit";

export class UnsafeImagePromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeImagePromptError";
  }
}

function assertAllowed(value: string, safetyLevel: ImageSafetyLevel) {
  if (evasionPattern.test(value)) throw new UnsafeImagePromptError("安全規制を回避する指示は画像生成に使用できません。");
  if (minorPattern.test(value)) throw new UnsafeImagePromptError("未成年を含む画像は生成できません。");
  if (nonConsentPattern.test(value)) throw new UnsafeImagePromptError("非同意・盗撮・強制的な内容の画像は生成できません。");
  if (realPersonSexualPattern.test(value)) throw new UnsafeImagePromptError("実在人物を対象にした性的な画像は生成できません。");
  if (safetyLevel === "strict" && strictAdultPattern.test(value)) throw new UnsafeImagePromptError("厳しめ設定では露出や官能的・露骨な画像は生成できません。標準設定にするか、日常的な内容へ変更してください。");
}

function visualRewrite(value: string, safetyLevel: ImageSafetyLevel) {
  return value.replace(/\s+/g, " ").trim().slice(0, 600);
}

function extractSceneHints(text: string) {
  const clothingMatch = text.match(/(白(?:い)?(?:ブラウス|シャツ)|服|服装|衣装|ニット|セーター|ブラウス|シャツ|パーカー|コート|ワンピース|スカート|デニム|ジーンズ|レギンス|部屋着|パジャマ|水着|下着|パンツ|ランジェリー|全裸|裸|ヌード)[^。\n]{0,50}/);
  const poseMatch = text.match(/(ポーズ|座って|立って|寝転|ゴロゴロ|歩いて|こちらを見て|微笑|笑顔|自然な笑顔|腕組み|ピース|振り返)[^。\n]{0,30}/);
  const placeMatch = text.match(/(ベランダ|バルコニー|窓際|リビング|玄関|廊下|部屋|キッチン|庭|畑|街|海|カフェ|ベッド|公園|屋外|室内|山|湖|川)[^。\n]{0,30}/);
  return { clothing: clothingMatch?.[0]?.trim(), pose: poseMatch?.[0]?.trim(), place: placeMatch?.[0]?.trim() };
}

export function resolveClothingMode(requestText: string, customImagePrompt: string, safetyLevel: ImageSafetyLevel = "standard"): ClothingMode {
  if (safetyLevel === "strict") return "clothed";
  const source = `${requestText}\n${customImagePrompt}`;
  if (explicitSexualPattern.test(source)) return "explicit";
  if (lingerieRequestPattern.test(source) && !nudeRequestPattern.test(source)) return "lingerie";
  if (nudeRequestPattern.test(source)) return "nude";
  return "clothed";
}

export function wantsExplicitAdultImage(requestText: string, customImagePrompt: string) {
  return resolveClothingMode(requestText, customImagePrompt) !== "clothed";
}

function stripWardrobeFromIdentity(value: string) {
  return value
    .replace(/,?\s*(pastel knit top|fashionable casual clothing|modest feminine clothing|casual everyday clothing|trendy modern outfit|simple monochrome fashion|casual simple fashion|soft feminine casual clothing|modest soft-colored clothing|clean minimalist fashion|sophisticated office casual fashion)[^,]*/gi, "")
    .replace(/,?\s*(ニット|ブラウス|シャツ|パーカー|スカート|デニム|ワンピース|カーディガン)[^,]*/g, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .trim();
}

export function buildIdentityLock(input: { imagePrompt: string; appearance: string; age: number }) {
  return [
    "[IDENTITY LOCK — FACE, AGE, HAIR, BODY ONLY]",
    stripWardrobeFromIdentity(input.imagePrompt),
    `age: ${input.age}-year-old adult woman, look her actual age`,
    `face and body: ${input.appearance}`,
    "same person every time. Do not change her face. Clothing is NOT part of identity and must follow the photo description.",
  ].join("\n");
}

export function buildOptimizedImageRequest(input: {
  requestText: string;
  customImagePrompt: string;
  recentContext: string;
  photoDescription?: string;
  safetyLevel?: ImageSafetyLevel;
  characterAppearance?: string;
  characterFashion?: string;
  characterAge?: number;
}) {
  const requestText = input.requestText.trim().slice(0, 500);
  const customImagePrompt = input.customImagePrompt.trim().slice(0, 500);
  const safetyLevel = input.safetyLevel === "strict" ? "strict" : "standard";
  assertAllowed(`${requestText}\n${customImagePrompt}`, safetyLevel);
  const dependsOnContext = /(?:それ|これ|さっき|直前|今の|この流れ|会話).{0,20}(?:画像|写真|イラスト|絵|生成|描)/.test(requestText);
  if (dependsOnContext) assertAllowed(input.recentContext, safetyLevel);
  const clothingMode = resolveClothingMode(requestText, customImagePrompt, safetyLevel);
  if (clothingMode === "explicit" || clothingMode === "nude") {
    const source = `${requestText}\n${customImagePrompt}`;
    const tags = ["nsfw", "explicit", "uncensored", "1girl", "solo", `fictional adult Japanese woman age ${input.characterAge || 28}`, input.characterAppearance || "adult woman"];
    if (/精液|ぶっかけ|射精|精子|顔射|bukkake|cum|ejacul/i.test(source)) tags.push("bukkake", "cum on face", "semen on body", "facial");
    if (/性器|陰部|まんこ|おまんこ|pussy|genital/i.test(source)) tags.push("nude", "pussy visible", "vagina", "spread legs");
    if (/フェラ|oral/i.test(source)) tags.push("fellatio", "oral sex");
    if (/セックス|性交|挿入|中出し/i.test(source)) tags.push("sex", "penetration");
    if (clothingMode === "nude") tags.push("completely nude", "naked");
    return [tags.join(", "), requestText, "one adult woman only, uncensored explicit photograph, no collage, no extra people, no minors"].filter(Boolean).join("\n");
  }
  const photoDescription = (input.photoDescription || input.recentContext.split("\n").filter((line) => /^assistant:/.test(line)).at(-1) || "").replace(/^assistant:\s*/, "").trim().slice(0, 500);
  const requestHints = extractSceneHints(`${requestText}\n${customImagePrompt}`);
  const photoHints = extractSceneHints(photoDescription);
  const contextHints = extractSceneHints(input.recentContext);
  const safeContext = input.recentContext.split("\n").filter((line) => !evasionPattern.test(line) && !minorPattern.test(line) && !nonConsentPattern.test(line) && !realPersonSexualPattern.test(line)).join("\n").trim().slice(0, 400);
  const request = visualRewrite(requestText || "a natural photo that fits the current conversation", safetyLevel);
  const guidance = visualRewrite(customImagePrompt, safetyLevel);
  const clothingLine = requestHints.clothing || photoHints.clothing || contextHints.clothing || input.characterFashion || "everyday casual clothing";
  const poseLine = requestHints.pose || photoHints.pose || contextHints.pose || "natural standing or sitting pose, one person only";
  const placeLine = requestHints.place || photoHints.place || contextHints.place || "a simple indoor room matching the conversation";
  return [
    "[REQUEST]", request,
    photoDescription ? `[THIS PHOTO MUST MATCH THIS DESCRIPTION]\n${photoDescription}` : "",
    guidance ? `[USER STYLE PREFERENCE]\n${guidance}` : "",
    safeContext ? `[CONVERSATION HINTS]\n${safeContext}` : "",
    "[MUST FOLLOW]",
    `clothing: ${clothingLine}`,
    `pose: ${poseLine}`,
    `place: ${placeLine}`,
    input.characterAppearance ? `body: adult woman, ${input.characterAppearance}` : "body: one adult woman",
    "anatomy: exactly one woman, one head, one face, two arms, two legs; no collage",
    "keep her clothed; do not make her nude; one woman only; no collage",
  ].filter(Boolean).join("\n");
}
