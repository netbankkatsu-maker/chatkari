export type Wardrobe = {
  clothingPreferences: string[];
  underwearPreferences: string[];
  clothes: string[];
  underwear: string[];
};

export function characterWardrobe(character: { id: string; fashion: string; wardrobe?: Wardrobe }): Wardrobe {
  if (character.wardrobe) return character.wardrobe;
  const colors = ["アイボリー", "ネイビー", "淡いピンク", "グレー", "黒", "ラベンダー"];
  const seed = [...character.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const color = colors[seed % colors.length];
  const sporty = /スポー|ランニング/.test(character.fashion);
  const simple = /モノトーン|シンプル|黒/.test(character.fashion);
  return {
    clothingPreferences: character.fashion.split(/[、,]/).filter(Boolean),
    underwearPreferences: [sporty ? "動きやすいスポーツタイプ" : simple ? "装飾の少ないシンプルなタイプ" : "控えめなレースのブラ・ショーツ", "肌触りと着心地を重視"],
    clothes: [character.fashion + "の普段着", color + "のニット", simple ? "白シャツと黒のパンツ" : "カジュアルなシャツとデニム", "部屋用の綿のパジャマ"],
    underwear: [color + "のブラ・ショーツセット", sporty ? "スポーツブラとシームレスショーツ" : "ベージュのシームレスブラ・ショーツ", "綿のリラックス用ショーツ"],
  };
}

export function sanitizeWardrobe(value: unknown): Wardrobe | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const list = (key: string) => Array.isArray(item[key]) ? item[key].filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).slice(0, 8).map((entry) => entry.trim().slice(0, 120)) : [];
  const result = { clothingPreferences: list("clothingPreferences"), underwearPreferences: list("underwearPreferences"), clothes: list("clothes"), underwear: list("underwear") };
  return Object.values(result).every((entries) => entries.length > 0) ? result : undefined;
}
