export type PlayCategory = "lingerie" | "toy" | "semen" | "oral" | "sex" | "nude" | "spread" | "anal" | "closeup";

const KNOWN_NSFW = "uber-realistic-porn-merge";

const rules: Array<{ id: PlayCategory; pattern: RegExp; prompt: string; lead: string }> = [
  {
    id: "lingerie",
    pattern: /(下着だけ|下着のみ|下着姿|下着|パンツ|ブラジャー|ブラ(?!ウス)|ランジェリー|lingerie|underwear)/i,
    prompt: "bra and panties only",
    lead: "(solo:1.7), (1girl:1.6), full body, standing in bedroom, (wearing only a matching lace bra and panties:1.75), (lingerie:1.6), underwear on, nipples covered by bra, crotch covered by panties, not nude, not topless, looking at viewer",
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
    prompt: "dildo fellatio",
    lead: "(solo:1.7), (1girl:1.6), close-up, (pink dildo in mouth:1.7), sucking a dildo, fellatio, looking at viewer, holding the dildo",
  },
  {
    id: "closeup",
    pattern: /(局部のみ|局部アップ|局部接写|局部|接写|クローズアップ|close-?up)/i,
    prompt: "genital close-up",
    lead: "(extreme close-up:1.7), (pussy:1.75), vagina, labia, wet, no face, no breasts, cropped macro photo",
  },
  {
    id: "spread",
    pattern: /(マンコくぱぁ|おまんこくぱぁ|まんこくぱぁ|くぱぁ|くぱあ|おまんこ|マンコ|pussy spread|spread pussy)/i,
    prompt: "spread pussy",
    lead: "(solo:1.7), (1girl:1.6), lying on back, (legs spread:1.6), (fingers spreading pussy:1.7), showing vagina, looking at viewer",
  },
  {
    id: "anal",
    pattern: /(アナルくぱぁ|アナル|anus spread|spread anus)/i,
    prompt: "spread anus",
    lead: "(solo:1.7), (1girl:1.6), on all fours, ass towards viewer, (hands spreading ass:1.65), (spread anus:1.7), showing asshole, looking back",
  },
  {
    id: "sex",
    pattern: /(セックス|性交|性行為|中出し|sex|intercourse)/i,
    prompt: "cowgirl pov",
    lead: "pov missionary, japanese milf on her back, legs spread, penis in vagina, looking at viewer, male body out of frame except the penis",
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

function detectCategories(text: string) {
  const found: PlayCategory[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(text) && !found.includes(rule.id)) found.push(rule.id);
  }
  return found;
}

const HARD_NSFW = /(全裸|裸にして|裸の写真|ヌード|脱いで|脱いだ|フェラ|セックス|性交|バイブ|ディルド|精液|ぶっかけ|局部|くぱぁ|アナル|オナニー|nude|naked|fellatio|sex)/i;
const UNDERWEAR_ONLY = /(下着だけ|下着のみ|下着姿だけ|パンツだけ|ブラだけ|ランジェリーだけ|下着姿|ランジェリー|(?:ブラとパンツ|パンツとブラ))/i;
const UNDERWEAR_PHOTO = /(下着|パンツ|ブラジャー|ブラ(?!ウス)|ランジェリー).{0,16}(写真|画像|写メ|自撮り)|(写真|画像|写メ|自撮り).{0,16}(下着|パンツ|ブラジャー|ランジェリー)/i;

export function resolvePlayCategories(text: string, requestText = "") {
  const focus = requestText.trim();
  if (focus && (UNDERWEAR_ONLY.test(focus) || UNDERWEAR_PHOTO.test(focus)) && !HARD_NSFW.test(focus)) {
    return ["lingerie"] as PlayCategory[];
  }
  const found = detectCategories(focus || text);
  if (found.includes("lingerie") && found.includes("nude") && !/(全裸|ヌード|naked|fully nude)/i.test(focus || text)) {
    return found.filter((id) => id !== "nude");
  }
  if (found.includes("toy") && found.includes("oral") && /(フェラ|口で|oral|fellatio)/i.test(focus || text)) {
    return found.filter((id) => id !== "toy");
  }
  if (found.includes("anal") && found.includes("spread")) {
    return found.filter((id) => id !== "spread");
  }
  if (found.includes("closeup") && found.includes("spread")) {
    if (/(くぱぁ|くぱあ)/i.test(focus || text) && !/(局部|接写|close-?up)/i.test(focus || text)) {
      return found.filter((id) => id !== "closeup");
    }
    return found.filter((id) => id !== "spread");
  }
  if (found.includes("anal") && found.includes("sex")) {
    if (/(くぱぁ|くぱあ|局部)/i.test(focus || text) || !/(セックス|性交|性行為|中出し|sex)/i.test(focus || text)) {
      return found.filter((id) => id !== "sex");
    }
    return found.filter((id) => id !== "anal");
  }
  if (found.includes("lingerie") && found.length > 1 && !HARD_NSFW.test(focus || text)) {
    return ["lingerie"] as PlayCategory[];
  }
  if (found.length) return found.slice(0, 1);
  return detectCategories(text).slice(0, 1);
}

export function playPromptAddons(categories: PlayCategory[]) {
  return rules.filter((rule) => categories.includes(rule.id)).map((rule) => rule.prompt).join(", ");
}

export function playLeadPrompt(categories: PlayCategory[], imagePrompt = "", age = 40) {
  const leads = rules.filter((rule) => categories.includes(rule.id)).map((rule) => rule.lead);
  const identity = categories.includes("closeup") ? `${age}yo japanese milf` : compactIdentity(imagePrompt, age);
  return [...leads, identity, "photorealistic"].join(", ");
}

export function playBasePrompt(category: PlayCategory, imagePrompt = "", age = 40) {
  const identity = compactIdentity(imagePrompt, age);
  if (category === "semen") {
    return `(solo:1.7), (1girl:1.6), (completely nude:1.3), close-up portrait, face and chest, looking at viewer, ${identity}, photorealistic`;
  }
  if (category === "oral") {
    return `(solo:1.7), (1girl:1.6), close-up face, looking at viewer, mouth slightly open, ${identity}, photorealistic`;
  }
  if (category === "spread") {
    return `(solo:1.7), (1girl:1.6), (completely nude:1.4), lying on back, legs spread, looking at viewer, ${identity}, photorealistic`;
  }
  if (category === "anal") {
    return `(solo:1.7), (1girl:1.6), (completely nude:1.4), on all fours, ass towards viewer, looking back, ${identity}, photorealistic`;
  }
  return playLeadPrompt(["nude"], imagePrompt, age);
}

export function playImg2ImgStrength(category: PlayCategory) {
  if (category === "toy") return 0.52;
  if (category === "semen") return 0.68;
  if (category === "spread" || category === "anal") return 0.7;
  return 0.55;
}

export function playUsesPornModel(categories: PlayCategory[]) {
  return categories.length > 0 && !categories.includes("lingerie");
}

export function playNeedsPartner(categories: PlayCategory[]) {
  return categories.includes("sex");
}

export function playNegatives(categories: PlayCategory[]) {
  const extra = [
    "(2girls:1.8)", "(two people:1.7)", "multiple girls", "couple", "twins", "second person",
    "male face", "crowd", "collage", "split screen", "cloned face", "group",
  ];
  if (categories.includes("lingerie")) extra.push(
    "nude", "naked", "completely nude", "topless", "bottomless", "no bra", "no panties",
    "nipples", "areola", "pussy", "vagina", "penis", "sex", "dress", "shirt", "jeans", "coat", "jacket",
  );
  if (categories.includes("toy")) extra.push("vibrator on head", "headband", "microphone", "holding wand", "toy in hand");
  if (categories.includes("semen")) extra.push("bottle", "cup", "glass", "jar", "lotion", "container", "pouring");
  if (categories.includes("oral")) extra.push("two faces", "penis", "male body", "dildo on forehead", "microphone");
  if (categories.includes("nude") && !categories.includes("lingerie")) extra.push("clothes", "dress", "shirt");
  if (categories.includes("spread")) extra.push("closed legs", "panties", "clothes");
  if (categories.includes("anal")) extra.push("front view", "clothes", "standing");
  if (categories.includes("closeup")) extra.push("face", "eyes", "hair", "clothes", "full body");
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
    return { modelId: "realistic-vision-51", nsfwModel: false, sdxl: false, loraModel: undefined as string | undefined, loraStrength: undefined as string | undefined };
  }
  if (categories.includes("lingerie")) {
    return { modelId: "realistic-vision-51", nsfwModel: true, sdxl: false, loraModel: undefined as string | undefined, loraStrength: undefined as string | undefined };
  }
  if (playNeedsPartner(categories) || categories.includes("closeup")) {
    return { modelId: "lustify", nsfwModel: true, sdxl: true, loraModel: undefined as string | undefined, loraStrength: undefined as string | undefined };
  }
  return { modelId: KNOWN_NSFW, nsfwModel: true, sdxl: false, loraModel: undefined as string | undefined, loraStrength: undefined as string | undefined };
}

export function playFrame(categories: PlayCategory[], sdxl = false) {
  if (categories.includes("closeup")) return { width: sdxl ? 768 : 512, height: sdxl ? 768 : 512 };
  if (sdxl) return { width: 768, height: 1024 };
  return { width: 512, height: 768 };
}

export function playLoras(categories: PlayCategory[]) {
  const engine = playEngine(categories);
  return { loraModel: engine.loraModel, loraStrength: engine.loraStrength };
}
