import { characters, sanitizeCharacter, type Character } from "@/data/characters";

function storedList(key: string): unknown[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
export function deletedCharacterIds() { return storedList("chatkari:deleted-characters").filter((id): id is string => typeof id === "string"); }
export function loadCharacterDirectory(includeDeleted = false) {
  const saved = ["chatkari:generated-characters", "chatkari:edited-characters"].flatMap((key) => storedList(key).flatMap((item) => { const character = sanitizeCharacter(item); return character ? [character] : []; }));
  const deleted = new Set(deletedCharacterIds());
  return [...new Map([...characters, ...saved].map((character) => [character.id, character])).values()].filter((character) => includeDeleted || !deleted.has(character.id));
}
export function saveDirectoryCharacter(character: Character) {
  const valid = sanitizeCharacter(character);
  if (!valid) throw new Error("プロフィールの内容を確認してください。");
  const saved = storedList("chatkari:edited-characters").flatMap((item) => { const entry = sanitizeCharacter(item); return entry ? [entry] : []; });
  localStorage.setItem("chatkari:edited-characters", JSON.stringify([...saved.filter((entry) => entry.id !== valid.id), valid]));
  restoreDirectoryCharacter(valid.id);
  return valid;
}
export function deleteDirectoryCharacter(id: string) { localStorage.setItem("chatkari:deleted-characters", JSON.stringify([...new Set([...deletedCharacterIds(), id])])); }
export function restoreDirectoryCharacter(id: string) { localStorage.setItem("chatkari:deleted-characters", JSON.stringify(deletedCharacterIds().filter((entry) => entry !== id))); }
