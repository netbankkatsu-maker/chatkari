"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChatScreen } from "@/components/ChatScreen";
import { sanitizeCharacter, type Character } from "@/data/characters";
import { isGroupRoom, memberIdsFromRoomId, rememberGroup, resolveLocalCharacters } from "@/lib/group";

export function ChatRoom({ characterId, staticCharacter }: { characterId: string; staticCharacter?: Character }) {
  const grouped = isGroupRoom(characterId);
  const [character, setCharacter] = useState<Character | null | undefined>(grouped ? undefined : staticCharacter);
  const [members, setMembers] = useState<Character[] | undefined>(grouped ? undefined : staticCharacter ? [staticCharacter] : undefined);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (isGroupRoom(characterId)) {
        const resolved = resolveLocalCharacters(memberIdsFromRoomId(characterId), characterId);
        if (resolved.length >= 2) {
          rememberGroup(characterId, resolved);
          setMembers(resolved);
          setCharacter(resolved[0]);
        } else {
          setMembers([]);
          setCharacter(null);
        }
        return;
      }
      if (staticCharacter) {
        setMembers([staticCharacter]);
        setCharacter(staticCharacter);
        return;
      }
      try {
        const stored = JSON.parse(localStorage.getItem("chatkari:generated-characters") || "[]") as unknown[];
        const found = stored.map(sanitizeCharacter).find((item) => item?.id === characterId);
        setCharacter(found || null);
        setMembers(found ? [found] : []);
      } catch {
        setCharacter(null);
        setMembers([]);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [characterId, staticCharacter]);

  if (character === undefined || members === undefined) return <main className="chat-room-state">チャットを読み込んでいます…</main>;
  if (character === null || !members.length) return <main className="chat-room-state"><p>この相手のデータが見つかりません。</p><Link href="/">ホームへ戻る</Link></main>;
  return <ChatScreen character={character} members={members} />;
}
