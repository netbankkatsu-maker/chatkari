export type PlayCategory = "lingerie" | "toy" | "semen" | "oral" | "sex" | "nude";

const KNOWN_NSFW = "uber-realistic-porn-merge";

const rules: Array<{ id: PlayCategory; pattern: RegExp; prompt: string; lead: string }> = [
  {
    id: "lingerie",
    pattern: /(下着姿|下着|パンツ|ブラジャー|ブラ(?!ウス)|ランジェリー|lingerie|underwear)/i,
    prompt: "bra and panties",
    lead: "(solo:1.7), (1girl:1.6), (lingerie:1.45), matching lace bra and panties, underwear on, not nude, looking at viewer, bedroom",
  },
  {
    id: "toy",
    pattern: /(バイブ|ディルド|挿入|vibrator|dildo)/i,
    prompt: "dildo inserted",
    lead: "(solo:1.7), (1girl:1.6), lying on bed, legs spread, (pink dildo inside pussy:1.6), masturbation, one woman only, looking at viewer",
  },
  {
    id: "semen",
    pattern: /(精液|ぶっかけ|顔射|射精|精子|cum|bukkake|facial)/i,
    prompt: "cum on face",
    lead: "(cum on face:1.7), (facial:1.55), 1girl, close-up, dripping cum on lips chin and cheeks, looking at viewer, no bottle",
  },
  {
    id: "oral",
    pattern: /(フェラ|口で|oral|fellatio)/i,
    prompt: "fellatio pov",
    lead: "1girl, 1boy, pov, fellatio, penis, oral, looking at viewer, from above, close-up, japanese milf",
  },
  {
    id: "sex",
    pattern: /(セックス|性交|性行為|中出し|sex|intercourse)/i,
    prompt: "cowgirl pov",
    lead: "1girl, 1boy, pov, cowgirl, vaginal, penis, riding, looking at viewer, japanese milf, bedroom",
  },
  {
    id: "nude",
    pattern: /(全裸|裸にして|裸の写真|ヌード|脱いで|nude|naked)/i,
    prompt: "fully nude",
    lead: "(solo:1.7), (1girl:1.6), (completely nude:1.5), naked, no clothes, looking at viewer, bedroom",
  },
];

function compactIdentity(imagePrompt: string, age: number) {
  const ascii = imagePrompt.replace(/[^\x00-\x7F]+/g, " ").replace(/\s+/g, " ").toLowerCase();
  const hair = /bob/.test(ascii) ? "short black bob with bangs" : /ponytail/.test(ascii) ? "dark ponytail" : /long/.test(ascii) ? "long black hair" : "black hair";
  return `${age}yo japanese milf, ${hair}, dark eyes, curvy`;
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
  return found.slice(0, 1);
}

export function playPromptAddons(categories: PlayCategory[]) {
  return rules.filter((rule) => categories.includes(rule.id)).map((rule) => rule.prompt).join(", ");
}

export function playLeadPrompt(categories: PlayCategory[], imagePrompt = "", age = 40) {
  const leads = rules.filter((rule) => categories.includes(rule.id)).map((rule) => rule.lead);
  return [...leads, compactIdentity(imagePrompt, age), "photorealistic"].join(", ");
}

export function playBasePrompt(category: PlayCategory, imagePrompt = "", age = 40) {
  const identity = compactIdentity(imagePrompt, age);
  if (category === "semen") {
    return `(solo:1.7), (1girl:1.6), (completely nude:1.3), close-up portrait, face and chest, looking at viewer, ${identity}, photorealistic`;
  }
  return playLeadPrompt(["nude"], imagePrompt, age);
}

export function playImg2ImgStrength(category: PlayCategory) {
  if (category === "toy") return 0.52;
  if (category === "semen") return 0.68;
  return 0.55;
}

export function playUsesPornModel(categories: PlayCategory[]) {
  return categories.length > 0;
}

export function playNeedsPartner(categories: PlayCategory[]) {
  return categories.includes("oral") || categories.includes("sex");
}

export function playNegatives(categories: PlayCategory[]) {
  const extra = [
    "(2girls:1.8)", "(two people:1.7)", "multiple girls", "couple", "twins", "second person",
    "male face", "crowd", "collage", "split screen", "cloned face", "group",
  ];
  if (categories.includes("toy")) extra.push("vibrator on head", "headband", "microphone", "holding wand", "toy in hand");
  if (categories.includes("semen")) extra.push("bottle", "cup", "glass", "jar", "lotion", "container", "pouring");
  if (categories.includes("nude") && !categories.includes("lingerie")) extra.push("clothes", "dress", "shirt");
  if (categories.includes("lingerie") && !categories.includes("nude")) extra.push("fully nude", "naked breasts");
  return extra.join(", ");
}

export function playNegativePrompt(categories: PlayCategory[], baseNegative: string) {
  if (playNeedsPartner(categories)) {
    return [
      "2girls", "two girls", "two women", "two faces", "two heads", "twins",
      "male face", "man's face", "beard", "full male body", "standing couple",
      "clothes", "dress", "shirt", "futanari", "woman with penis",
      "low quality", "blurry", "bad anatomy", "deformed", "extra fingers",
      "collage", "split screen", "watermark", "child", "teen", "underage",
    ].join(", ");
  }
  return `${baseNegative}, 2girls, two women, two heads, extra arms, extra breasts, third breast, collage, giant, elongated body, ${playNegatives(categories)}`;
}

export function playEngine(categories: PlayCategory[]) {
  if (!categories.length) {
    return { modelId: "realistic-vision-51", nsfwModel: false, loraModel: undefined as string | undefined, loraStrength: undefined as string | undefined };
  }
  return { modelId: KNOWN_NSFW, nsfwModel: true, loraModel: undefined as string | undefined, loraStrength: undefined as string | undefined };
}

export function playLoras(categories: PlayCategory[]) {
  const engine = playEngine(categories);
  return { loraModel: engine.loraModel, loraStrength: engine.loraStrength };
}
