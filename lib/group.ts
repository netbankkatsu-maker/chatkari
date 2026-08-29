import { characters, sanitizeCharacter, type Character } from "@/data/characters";

export const MAX_GROUP_SIZE = 4;

export function groupIdFromMembers(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))].sort();
  if (unique.length <= 1) return unique[0] || "";
  return `g-${unique.join("--")}`;
}

export function memberIdsFromRoomId(roomId: string) {
  if (!roomId.startsWith("g-")) return roomId ? [roomId] : [];
  return roomId.slice(2).split("--").filter(Boolean);
}

export function isGroupRoom(roomId: string) {
  return roomId.startsWith("g-");
}

export function groupTitle(members: Character[]) {
  if (!members.length) return "グループ";
  if (members.length === 1) return members[0].name;
  if (members.length === 2) return `${members[0].name}、${members[1].name}`;
  return `${members[0].name}たち`;
}

export function groupSubtitle(members: Character[]) {
  if (members.length <= 1) return "オンライン";
  return `${members.length}人のグループ`;
}

export function allKnownCharacters() {
  let generated: Character[] = [];
  try {
    generated = (JSON.parse(localStorage.getItem("chatkari:generated-characters") || "[]") as unknown[]).flatMap((item) => {
      const character = sanitizeCharacter(item);
      return character ? [character] : [];
    });
  } catch { /* Ignore corrupt generated profiles. */ }
  return [...characters, ...generated].filter((character, index, list) => list.findIndex((item) => item.id === character.id) === index);
}

export function rememberedGroupIds() {
  try {
    const stored = JSON.parse(localStorage.getItem("chatkari:groups") || "[]") as unknown;
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string" && id.startsWith("g-")).slice(0, 40) : [];
  } catch {
    return [];
  }
}

export function snapshotMembers(roomId: string) {
  try {
    const stored = JSON.parse(localStorage.getItem(`chatkari:group-members:${roomId}`) || "[]") as unknown[];
    return Array.isArray(stored) ? stored.flatMap((item) => {
      const character = sanitizeCharacter(item);
      return character ? [character] : [];
    }) : [];
  } catch {
    return [];
  }
}

export function resolveLocalCharacters(ids: string[], roomId?: string) {
  const snapshots = [...(roomId ? snapshotMembers(roomId) : []), ...rememberedGroupIds().flatMap(snapshotMembers)];
  const pool = [...snapshots, ...allKnownCharacters()].filter((character, index, list) => list.findIndex((item) => item.id === character.id) === index);
  return ids.flatMap((id) => pool.find((character) => character.id === id) || []);
}

export function rememberGroup(roomId: string, members?: Character[]) {
  if (!roomId.startsWith("g-")) return;
  const next = [roomId, ...rememberedGroupIds().filter((id) => id !== roomId)].slice(0, 40);
  localStorage.setItem("chatkari:groups", JSON.stringify(next));
  if (members?.length) {
    try {
      localStorage.setItem(`chatkari:group-members:${roomId}`, JSON.stringify(members));
    } catch { /* Ignore quota errors; the room id still works if profiles remain. */ }
  }
}

export function forgetGroup(roomId: string) {
  localStorage.setItem("chatkari:groups", JSON.stringify(rememberedGroupIds().filter((id) => id !== roomId)));
  localStorage.removeItem(`chatkari:group-members:${roomId}`);
}
