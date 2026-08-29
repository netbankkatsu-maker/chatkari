export type PlayCategory = "lingerie" | "toy" | "semen" | "oral" | "sex" | "nude";

const rules: Array<{ id: PlayCategory; pattern: RegExp; prompt: string; lead: string }> = [
  {
    id: "lingerie",
    pattern: /(下着姿|下着|パンツ|ブラジャー|ブラ(?!ウス)|ランジェリー|lingerie|underwear)/i,
    prompt: "wearing a matching bra and panties, underwear on, not fully nude",
    lead: "solo 1girl, lace bra and panties, lingerie, indoor",
  },
  {
    id: "toy",
    pattern: /(バイブ|ディルド|挿入|vibrator|dildo)/i,
    prompt: "vibrator inserted in vagina",
    lead: "solo 1girl, one pink vibrator inserted in pussy, legs spread, indoor, only one toy",
  },
  {
    id: "semen",
    pattern: /(精液|ぶっかけ|顔射|射精|精子|cum|bukkake|facial)/i,
    prompt: "semen on face and body",
    lead: "solo 1girl, bukkake, cum on face, facial, indoor close-up, no bottle",
  },
  {
    id: "oral",
    pattern: /(フェラ|口で|oral|fellatio)/i,
    prompt: "fellatio",
    lead: "solo 1girl, fellatio POV, penis in mouth, one face only, indoor",
  },
  {
    id: "sex",
    pattern: /(セックス|性交|性行為|中出し|sex|intercourse)/i,
    prompt: "vaginal sex",
    lead: "solo 1girl, cowgirl POV, vaginal penetration, one face only, indoor",
  },
  {
    id: "nude",
    pattern: /(全裸|裸にして|裸の写真|ヌード|脱いで|nude|naked)/i,
    prompt: "fully nude",
    lead: "solo 1girl, completely nude, no panties, no bra, indoor",
  },
];

export function resolvePlayCategories(text: string) {
  const found: PlayCategory[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(text) && !found.includes(rule.id)) found.push(rule.id);
  }
  if (found.includes("lingerie") && found.includes("nude") && !/(全裸|ヌード|naked|fully nude)/i.test(text)) {
    return found.filter((id) => id !== "nude");
  }
  return found.slice(0, 2);
}

export function playPromptAddons(categories: PlayCategory[]) {
  return rules.filter((rule) => categories.includes(rule.id)).map((rule) => rule.prompt).join(", ");
}

export function playLeadPrompt(categories: PlayCategory[], appearance = "", age = 40) {
  const leads = rules.filter((rule) => categories.includes(rule.id)).map((rule) => rule.lead);
  const identity = ["Japanese adult woman", `look ${age}`, appearance, "black hair with bangs"].filter(Boolean).join(", ");
  return ["solo, 1girl, only one woman in the photo", ...leads, identity, "photorealistic"].join(", ");
}

export function playUsesPornModel(categories: PlayCategory[]) {
  return categories.some((id) => id !== "lingerie");
}

export function playNegatives(categories: PlayCategory[]) {
  const extra = ["(2girls:1.5)", "two women", "second person", "twins", "collage", "split screen"];
  if (categories.includes("toy")) extra.push("toy on head", "two vibrators", "remote control wand in hand");
  if (categories.includes("semen")) extra.push("measuring cup", "bottle", "outdoors", "two people", "pouring liquid");
  if (categories.includes("oral")) extra.push("two faces", "giant penis", "second woman");
  if (categories.includes("sex")) extra.push("two women", "futanari", "woman with penis");
  if (categories.includes("nude") && !categories.includes("lingerie")) extra.push("panties", "bra", "underwear");
  if (categories.includes("lingerie") && !categories.includes("nude")) extra.push("fully nude");
  return extra.join(", ");
}

export function playLoras(_categories: PlayCategory[]) {
  return { loraModel: undefined as string | undefined, loraStrength: undefined as string | undefined };
}
