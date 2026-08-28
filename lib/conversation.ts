export type ConversationMemory = {
  category: "identity" | "like" | "dislike" | "work" | "plan" | "people" | "other";
  content: string;
  createdAt: number;
  lastUsedAt: number;
};

export type RelationshipState = {
  affection: number;
  trust: number;
  familiarity: number;
  energy: number;
  annoyance: number;
  mood: "guarded" | "relaxed" | "cheerful" | "concerned" | "flirty" | "annoyed";
  lastTopic: string;
  turnCount: number;
};

export const DEFAULT_RELATIONSHIP: RelationshipState = {
  affection: 20,
  trust: 15,
  familiarity: 5,
  energy: 65,
  annoyance: 0,
  mood: "guarded",
  lastTopic: "初対面",
  turnCount: 0,
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function sanitizeRelationship(value: unknown, legacyAffection = 20): RelationshipState {
  if (!value || typeof value !== "object") return { ...DEFAULT_RELATIONSHIP, affection: clamp(legacyAffection) };
  const item = value as Partial<RelationshipState>;
  const moods: RelationshipState["mood"][] = ["guarded", "relaxed", "cheerful", "concerned", "flirty", "annoyed"];
  return {
    affection: clamp(Number(item.affection) || legacyAffection),
    trust: clamp(Number(item.trust) || 15),
    familiarity: clamp(Number(item.familiarity) || 5),
    energy: clamp(Number(item.energy) || 65),
    annoyance: clamp(Number(item.annoyance) || 0),
    mood: moods.includes(item.mood as RelationshipState["mood"]) ? item.mood as RelationshipState["mood"] : "guarded",
    lastTopic: typeof item.lastTopic === "string" ? item.lastTopic.slice(0, 30) : "日常",
    turnCount: Math.max(0, Math.min(10000, Math.round(Number(item.turnCount) || 0))),
  };
}

function topicFrom(text: string) {
  if (/(仕事|会社|バイト|職場)/.test(text)) return "仕事";
  if (/(旅行|行く予定|ホテル|飛行機)/.test(text)) return "旅行";
  if (/(料理|ご飯|食べ|飲み)/.test(text)) return "食事";
  if (/(家族|友達|子ども|子供|夫|妻)/.test(text)) return "身近な人";
  if (/(疲れ|しんど|つら|悲し|悩)/.test(text)) return "気分・悩み";
  if (/(好き|会いたい|かわいい|エロ|下着)/.test(text)) return "親密な話";
  return text.trim().slice(0, 18) || "日常";
}

export function advanceRelationship(current: RelationshipState, text: string) {
  const positive = /(好き|かわいい|素敵|楽しい|ありがとう|会いたい|嬉しい)/.test(text);
  const hostile = /(嫌い|うざ|消えろ|ばか|黙れ)/.test(text);
  const vulnerable = /(疲れ|しんど|つら|悲し|悩ん|不安)/.test(text);
  const intimate = /(好き|会いたい|エロ|下着|キス|抱き)/.test(text);
  const turnCount = current.turnCount + 1;
  return {
    affection: clamp(current.affection + (hostile ? -5 : positive ? 4 : 1)),
    trust: clamp(current.trust + (hostile ? -4 : vulnerable ? 3 : 1)),
    familiarity: clamp(current.familiarity + 2),
    energy: clamp(current.energy + (text.length > 180 ? -2 : 1)),
    annoyance: clamp(current.annoyance + (hostile ? 12 : -2)),
    mood: hostile ? "annoyed" : vulnerable ? "concerned" : intimate ? "flirty" : positive ? "cheerful" : turnCount < 3 ? "guarded" : "relaxed",
    lastTopic: topicFrom(text),
    turnCount,
  } satisfies RelationshipState;
}

function memoryCategory(text: string): ConversationMemory["category"] | undefined {
  if (/(名前は|と呼んで|住んで|出身)/.test(text)) return "identity";
  if (/(好き|ハマって|趣味)/.test(text)) return "like";
  if (/(嫌い|苦手)/.test(text)) return "dislike";
  if (/(仕事|会社|職場|働いて)/.test(text)) return "work";
  if (/(予定|旅行|行くんだ|行くよ|予約)/.test(text)) return "plan";
  if (/(家族|友達|彼氏|彼女|夫|妻|子ども|子供)/.test(text)) return "people";
  if (/(覚えておいて|覚えといて)/.test(text)) return "other";
  return undefined;
}

export function rememberFromMessage(existing: ConversationMemory[], text: string) {
  const now = Date.now();
  const candidates = text.split(/[。！？!?\n]+/).map((part) => part.trim()).filter((part) => part.length >= 3 && part.length <= 100);
  const additions = candidates.flatMap((content) => {
    const category = memoryCategory(content);
    return category ? [{ category, content, createdAt: now, lastUsedAt: now } satisfies ConversationMemory] : [];
  });
  if (!additions.length) return existing;
  const merged = [...existing];
  for (const memory of additions) {
    const normalized = memory.content.replace(/\s/g, "");
    const duplicate = merged.findIndex((item) => item.content.replace(/\s/g, "") === normalized);
    if (duplicate >= 0) merged[duplicate] = { ...merged[duplicate], lastUsedAt: now };
    else merged.push(memory);
  }
  return merged.slice(-12);
}

export function sanitizeMemories(value: unknown) {
  if (!Array.isArray(value)) return [];
  const categories: ConversationMemory["category"][] = ["identity", "like", "dislike", "work", "plan", "people", "other"];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<ConversationMemory>;
    if (typeof item.content !== "string") return [];
    const content = item.content.replace(/[\r\n<>\{\}]/g, " ").trim().slice(0, 100);
    if (!content) return [];
    return [{
      category: categories.includes(item.category as ConversationMemory["category"]) ? item.category as ConversationMemory["category"] : "other",
      content,
      createdAt: Number(item.createdAt) || Date.now(),
      lastUsedAt: Number(item.lastUsedAt) || Date.now(),
    } satisfies ConversationMemory];
  }).slice(-12);
}
