"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChatScreen } from "@/components/ChatScreen";
import { type Character } from "@/data/characters";
import { isGroupRoom, memberIdsFromRoomId, rememberGroup, resolveLocalCharacters } from "@/lib/group";

export function ChatRoom({ characterId, staticCharacter }: { characterId: string; staticCharacter?: Character }) {
  const [character, setCharacter] = useState<Character | null | undefined>(undefined);
  const [members, setMembers] = useState<Character[] | undefined>(undefined);

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
      const found = resolveLocalCharacters([characterId])[0];
      setCharacter(found || null);
      setMembers(found ? [found] : []);
    });
    return () => cancelAnimationFrame(frame);
  }, [characterId, staticCharacter]);

  if (character === undefined || members === undefined) return <main className="chat-room-state">チャットを読み込んでいます…</main>;
  if (character === null || !members.length) return <main className="chat-room-state"><p>この相手のデータが見つかりません。</p><Link href="/">ホームへ戻る</Link></main>;
  return <ChatScreen character={character} members={members} />;
}
