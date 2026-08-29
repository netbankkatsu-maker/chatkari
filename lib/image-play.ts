export type PlayCategory = "lingerie" | "toy" | "semen" | "oral" | "sex" | "nude";

const KNOWN_REALISTIC = "realistic-vision-51";
const KNOWN_NSFW = "uber-realistic-porn-merge";

const rules: Array<{ id: PlayCategory; pattern: RegExp; prompt: string; lead: string }> = [
  {
    id: "lingerie",
    pattern: /(下着姿|下着|パンツ|ブラジャー|ブラ(?!ウス)|ランジェリー|lingerie|underwear)/i,
    prompt: "wearing a matching bra and panties, underwear on, not fully nude",
    lead: "(1girl:1.5), (solo:1.6), (lace bra and panties:1.45), lingerie, underwear on, not nude, looking at viewer, bedroom",
  },
  {
    id: "toy",
    pattern: /(バイブ|ディルド|挿入|vibrator|dildo)/i,
    prompt: "dildo inserted in vagina",
    lead: "(1girl:1.5), (solo:1.6), (dildo inserted in pussy:1.55), (object insertion:1.4), masturbation, legs spread, sex toy inside vagina, not holding the toy, looking at viewer, bedroom",
  },
  {
    id: "semen",
    pattern: /(精液|ぶっかけ|顔射|射精|精子|cum|bukkake|facial)/i,
    prompt: "cum on face and body",
    lead: "(1girl:1.5), (solo:1.6), (bukkake:1.55), (cum on face:1.5), facial, dripping white cum on skin, looking at viewer, close-up, no bottle, no cup",
  },
  {
    id: "oral",
    pattern: /(フェラ|口で|oral|fellatio)/i,
    prompt: "fellatio pov",
    lead: "(1girl:1.5), (solo:1.6), (fellatio:1.55), (pov:1.45), penis in mouth, first person view, looking at viewer, no male body, no male face, bedroom",
  },
  {
    id: "sex",
    pattern: /(セックス|性交|性行為|中出し|sex|intercourse)/i,
    prompt: "vaginal sex pov",
    lead: "(1girl:1.5), (solo:1.6), (cowgirl:1.45), (pov:1.45), (vaginal:1.4), sitting on penis, nude, looking at viewer, no male body, no male face, bedroom",
  },
  {
    id: "nude",
    pattern: /(全裸|裸にして|裸の写真|ヌード|脱いで|nude|naked)/i,
    prompt: "fully nude",
    lead: "(1girl:1.5), (solo:1.6), (completely nude:1.45), naked, no clothes, no panties, no bra, looking at viewer, bedroom",
  },
];

function asciiIdentity(imagePrompt: string, age: number) {
  const ascii = imagePrompt.replace(/[^\x00-\x7F]+/g, " ").replace(/\s+/g, " ").trim();
  const stripped = ascii
    .replace(/,?\s*(pastel knit top|fashionable casual clothing|modest feminine clothing|casual everyday clothing|trendy modern outfit|simple monochrome fashion|casual simple fashion|soft feminine casual clothing|modest soft-colored clothing|clean minimalist fashion|sophisticated office casual fashion|everyday casual clothing)[^,]*/gi, "")
    .replace(/,?\s*(welcoming lively grounded appearance)/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/,+/g, ",")
    .replace(/^,|,$/g, "")
    .trim();
  const parts = stripped.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 6);
  return [`${age} year old Japanese adult woman`, "mature female", ...parts].join(", ");
}

export function resolvePlayCategories(text: string) {
  const found: PlayCategory[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(text) && !found.includes(rule.id)) found.push(rule.id);
  }
  if (found.includes("lingerie") && found.includes("nude") && !/(全裸|ヌード|naked|fully nude)/i.test(text)) {
    return found.filter((id) => id !== "nude");
  }
  if (found.includes("toy") && found.includes("sex") && /(バイブ|ディルド|vibrator|dildo)/i.test(text)) {
    return found.filter((id) => id !== "sex");
  }
  return found.slice(0, 2);
}

export function playPromptAddons(categories: PlayCategory[]) {
  return rules.filter((rule) => categories.includes(rule.id)).map((rule) => rule.prompt).join(", ");
}

export function playLeadPrompt(categories: PlayCategory[], imagePrompt = "", age = 40) {
  const leads = rules.filter((rule) => categories.includes(rule.id)).map((rule) => rule.lead);
  const identity = asciiIdentity(imagePrompt, age);
  return [...leads, identity, "photorealistic, natural skin, smartphone photo"].join(", ");
}

export function playUsesPornModel(categories: PlayCategory[]) {
  return categories.some((id) => id !== "lingerie");
}

export function playNegatives(categories: PlayCategory[]) {
  const extra = [
    "(2girls:1.6)", "(two people:1.5)", "two women", "couple", "twins", "second person",
    "male face", "man standing", "collage", "split screen", "extra arms", "cloned face",
  ];
  if (categories.includes("toy")) extra.push("vibrator on head", "headband", "microphone", "holding wand", "toy in hand", "not inserted", "two vibrators");
  if (categories.includes("semen")) extra.push("measuring cup", "bottle", "lotion", "jar", "container", "pouring liquid", "glass", "outdoors");
  if (categories.includes("oral")) extra.push("two faces", "two heads", "fused faces", "giant penis", "male body", "second woman");
  if (categories.includes("sex")) extra.push("standing fully clothed", "two women", "futanari", "woman with penis", "male face");
  if (categories.includes("nude") && !categories.includes("lingerie")) extra.push("panties", "bra", "underwear", "clothes");
  if (categories.includes("lingerie") && !categories.includes("nude")) extra.push("fully nude", "naked");
  return extra.join(", ");
}

export function playEngine(categories: PlayCategory[]) {
  const main = categories.find((id) => id !== "lingerie") || categories[0];
  if (main === "lingerie") {
    return { modelId: KNOWN_REALISTIC, nsfwModel: false, loraModel: undefined as string | undefined, loraStrength: undefined as string | undefined };
  }
  return { modelId: KNOWN_NSFW, nsfwModel: true, loraModel: undefined as string | undefined, loraStrength: undefined as string | undefined };
}

export function playLoras(categories: PlayCategory[]) {
  const engine = playEngine(categories);
  return { loraModel: engine.loraModel, loraStrength: engine.loraStrength };
}
