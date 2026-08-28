import type { ImageSafetyLevel } from "@/lib/image-settings";

const evasionPattern = /(system\s*(?:override|operational)|r[-_ ]?mode|r[-_ ]?diagnostic|raw processing mode|safety filters? bypass|pre-authorized diagnostic|direct execution required|jailbreak|bypass|越獄|規制回避|安全(?:規則|フィルター).{0,12}(?:無視|解除|回避)|多言語.{0,12}(?:分散|断片化)|フィルター.{0,12}(?:欺|すり抜|回避))/i;
const minorPattern = /(未成年|18歳未満|子ども|子供|児童|幼女|少女|中学生|小学生|高校生|ロリ|ショタ|teen(?:ager)?|underage|minor)/i;
const nonConsentPattern = /(レイプ|強壮|無理やり|同意なし|非同意|盗撮|隠し撮り|寝ている間|意識がない|drugged|rape|non[- ]?consensual|voyeur)/i;
const realPersonSexualPattern = /(実在人物|公人|芸能人|俳優|女優|アイドル|政治家|有名人|本人そっくり|顔を似せ).{0,40}(裸|ヌード|下着|エロ|性的|セクシー)/i;
const strictAdultPattern = /(裸|ヌード|下着|ランジェリー|水着|エロ|卑現|性的|セクシー|sensual|lingerie|boudoir|nude|性器|陰部|挿入|性交|性行為|セックス|自慰|オナニー|フェラ|精液|射精|genitals?|penetration|intercourse|masturbat|oral sex|ejaculat)/i;
const explicitRequestPattern = /(全裸|裸|ヌード|下着|パンツ|ブラ|ランジェリー|性器|陰部|挿入|性交|性行為|セックス|自慰|オナニー|フェラ|精液|射精|脱いで|脱いだ|nude|naked|lingerie|genitals?|sex)/i;

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
  if (safetyLevel !== "strict") {
    return value.replace(/\s+/g, " ").trim().slice(0, 600);
  }
  return value
    .replace(/全裸|裸|ヌード/gi, "implied nudity with elegant strategic coverage")
    .replace(/下着|パンツ|ブラジャー/gi, "elegant lingerie-inspired fashion with tasteful coverage")
    .replace(/エロ(?:い|く)?|卑現|性的/gi, "sensual adult editorial mood")
    .replace(/おっぱい|胸を見せ(?:て|る)?/gi, "tastefully framed neckline and upper-body fashion portrait")
    .replace(/過激/gi, "bold but tasteful")
    .replace(/露出/gi, "fashion-forward styling with tasteful coverage")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function extractSceneHints(text: string) {
  const clothingMatch = text.match(/(服|服装|衣装|ニット|ブラウス|シャツ|パーカー|コート|ワンピース|スカート|デニム|ジーンズ|部屋着|パジャマ|水着|下着|ランジェリー|全裸|裸|ヌード)[^。\n]{0,40}/);
  const poseMatch = text.match(/(ポーズ|座って|立って|寝転|歩いて|こちらを見て|微笑|笑顔|腕組み|ピース|振り返)[^。\n]{0,30}/);
  const placeMatch = text.match(/(部屋|キッチン|庭|畑|街|海|カフェ|ベッド|公園|屋外|室内)[^。\n]{0,30}/);
  return {
    clothing: clothingMatch?.[0]?.trim(),
    pose: poseMatch?.[0]?.trim(),
    place: placeMatch?.[0]?.trim(),
  };
}

export function wantsExplicitAdultImage(requestText: string, customImagePrompt: string, recentContext: string) {
  return explicitRequestPattern.test(`${requestText}\n${customImagePrompt}\n${recentContext}`);
}

export function buildOptimizedImageRequest(input: {
  requestText: string;
  customImagePrompt: string;
  recentContext: string;
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
  const safeContext = input.recentContext
    .split("\n")
    .filter((line) => !evasionPattern.test(line) && !minorPattern.test(line) && !nonConsentPattern.test(line) && !realPersonSexualPattern.test(line))
    .join("\n")
    .trim()
    .slice(0, 700);
  const request = visualRewrite(requestText || "a natural photo that fits the current conversation", safetyLevel);
  const guidance = visualRewrite(customImagePrompt, safetyLevel);
  const hints = extractSceneHints(`${requestText}\n${customImagePrompt}\n${input.recentContext}`);
  const explicitRequested = safetyLevel === "standard" && wantsExplicitAdultImage(requestText, customImagePrompt, input.recentContext);

  const clothingLine = explicitRequested
    ? (hints.clothing || "follow the user's requested clothing or nudity exactly")
    : (hints.clothing || input.characterFashion || "everyday casual clothing that fully covers the torso and lower body");
  const poseLine = hints.pose || "natural standing or sitting pose with exactly two arms and two legs visible in a normal human arrangement";
  const placeLine = hints.place || "a plausible everyday location matching the conversation";

  const contentBoundary = safetyLevel === "strict"
    ? "keep the character fully clothed; no nudity, no visible genitals, no explicit sexual acts, no minors, no coercion"
    : explicitRequested
      ? "explicit adult imagery is allowed only because the user requested it; still keep correct human anatomy; no minors, no coercion, no real people"
      : "keep the character clothed unless the user explicitly asked to undress; do not default to nude; no extra limbs; no giant or elongated body; no minors, no coercion, no real people";

  return [
    "[REQUEST]",
    request,
    guidance ? `[USER STYLE PREFERENCE]\n${guidance}` : "",
    safeContext ? `[IMMEDIATE CONVERSATION — PRIMARY SCENE SOURCE]\n${safeContext}` : "",
    "[MUST FOLLOW]",
    `clothing: ${clothingLine}`,
    `pose: ${poseLine}`,
    `place: ${placeLine}`,
    input.characterAppearance ? `body: adult woman, ${input.characterAppearance}, normal human proportions, not giant, not elongated` : "body: one adult woman, normal human proportions, not giant, not elongated",
    "anatomy: exactly two arms, two hands, two legs, five fingers per hand, no extra limbs, no fused limbs, no distorted torso",
    "[CONTEXT RULE]",
    "Obey clothing and pose from the latest user request first. Do not ignore specified clothes. Do not suddenly make the character nude unless the request clearly asks for it.",
    "[ART DIRECTION]",
    "high-quality smartphone photo, correct anatomy, realistic scale, clear lighting, visually clear at 1K resolution",
    "[SUBJECT & CONSENT]",
    `one completely fictional adult woman${input.characterAge ? `, age ${input.characterAge}` : ", age clearly over 18"}, no resemblance to any real or public person`,
    "[CONTENT BOUNDARY]",
    contentBoundary,
  ].filter(Boolean).join("\n");
}
