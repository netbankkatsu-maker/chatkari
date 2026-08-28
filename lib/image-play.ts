export type PlayCategory = "lingerie" | "toy" | "semen" | "oral" | "sex" | "nude";

const rules: Array<{ id: PlayCategory; pattern: RegExp; prompt: string }> = [
  { id: "lingerie", pattern: /(下着姿|下着|パンツ|ブラジャー|ブラ(?!ウス)|ランジェリー|lingerie|underwear)/i, prompt: "wearing a matching bra and panties, underwear on, not fully nude" },
  { id: "toy", pattern: /(バイブ|ディルド|挿入|vibrator|dildo)/i, prompt: "sex toy insertion, vibrator inserted in vagina, not merely held in the hand" },
  { id: "semen", pattern: /(精液|ぶっかけ|顔射|射精|精子|cum|bukkake|facial)/i, prompt: "semen on face and body" },
  { id: "oral", pattern: /(フェラ|口で|oral|fellatio)/i, prompt: "fellatio, one adult woman" },
  { id: "sex", pattern: /(セックス|性交|性行為|中出し|sex|intercourse)/i, prompt: "consensual adult sex, one woman only" },
  { id: "nude", pattern: /(全裸|裸にして|裸の写真|ヌード|脱いで|nude|naked)/i, prompt: "fully nude adult woman, natural body, two breasts only" },
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

export function playLoras(categories: PlayCategory[]) {
  if (!categories.length) return { loraModel: undefined as string | undefined, loraStrength: undefined as string | undefined };
  return { loraModel: "add-detail-lora", loraStrength: "0.35" };
}
