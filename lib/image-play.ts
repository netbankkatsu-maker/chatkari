export type PlayCategory = "lingerie" | "toy" | "semen" | "oral" | "sex" | "nude";

const rules: Array<{ id: PlayCategory; pattern: RegExp; prompt: string; lead: string }> = [
  {
    id: "lingerie",
    pattern: /(下着姿|下着|パンツ|ブラジャー|ブラ(?!ウス)|ランジェリー|lingerie|underwear)/i,
    prompt: "wearing a matching bra and panties, underwear on, not fully nude",
    lead: "solo, 1girl, wearing lace bra and panties, lingerie, underwear on, not nude, clothes on",
  },
  {
    id: "toy",
    pattern: /(バイブ|ディルド|挿入|vibrator|dildo)/i,
    prompt: "vibrator inserted in vagina",
    lead: "(pink vibrator inserted in pussy:1.4), sex toy insertion, dildo in vagina, spread legs, visible toy",
  },
  {
    id: "semen",
    pattern: /(精液|ぶっかけ|顔射|射精|精子|cum|bukkake|facial)/i,
    prompt: "semen on face and body",
    lead: "(bukkake:1.4), (cum on face:1.3), cum on breasts, thick semen, facial",
  },
  {
    id: "oral",
    pattern: /(フェラ|口で|oral|fellatio)/i,
    prompt: "fellatio",
    lead: "(fellatio:1.4), oral sex, penis in mouth, kneeling, looking at viewer, no second face",
  },
  {
    id: "sex",
    pattern: /(セックス|性交|性行為|中出し|sex|intercourse)/i,
    prompt: "vaginal sex",
    lead: "(vaginal sex:1.4), penis penetration, cowgirl, intercourse, male body out of frame except penis, no second face",
  },
  {
    id: "nude",
    pattern: /(全裸|裸にして|裸の写真|ヌード|脱いで|nude|naked)/i,
    prompt: "fully nude",
    lead: "completely nude, naked, nipples, pussy, no clothes",
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
  return found.slice(0, 3);
}

export function playPromptAddons(categories: PlayCategory[]) {
  return rules.filter((rule) => categories.includes(rule.id)).map((rule) => rule.prompt).join(", ");
}

export function playLeadPrompt(categories: PlayCategory[], appearance = "", age = 40) {
  const leads = rules.filter((rule) => categories.includes(rule.id)).map((rule) => rule.lead);
  const identity = [appearance, `look ${age} years old`, "Japanese adult woman", "black hair", "bangs"].filter(Boolean).join(", ");
  const solo = categories.some((id) => id === "oral" || id === "sex")
    ? "one woman only, no second face, no extra arms"
    : "solo, 1girl, only one woman, no second person";
  return [`${leads.join(", ")}`, identity, solo, "photorealistic smartphone photo"].filter(Boolean).join(", ");
}

export function playUsesPornModel(categories: PlayCategory[]) {
  return categories.some((id) => id !== "lingerie");
}

export function playLoras(_categories: PlayCategory[]) {
  return { loraModel: undefined as string | undefined, loraStrength: undefined as string | undefined };
}
