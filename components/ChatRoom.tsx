"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChatScreen } from "@/components/ChatScreen";
import { sanitizeCharacter, type Character } from "@/data/characters";

export function ChatRoom({ characterId, staticCharacter }: { characterId: string; staticCharacter?: Character }) {
  const [character, setCharacter] = useState<Character | null | undefined>(staticCharacter);

  useEffect(() => {
    if (staticCharacter) return;
    const frame = requestAnimationFrame(() => {
      try {
        const stored = JSON.parse(localStorage.getItem("chatkari:generated-characters") || "[]") as unknown[];
        const found = stored.map(sanitizeCharacter).find((item) => item?.id === characterId);
        setCharacter(found || null);
      } catch {
        setCharacter(null);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [characterId, staticCharacter]);

  if (character === undefined) return <main className="chat-room-state">チャットを読み込んでいます…</main>;
  if (character === null) return <main className="chat-room-state"><p>この相手のデータが見つかりません。</p><Link href="/">ホームへ戻る</Link></main>;
  return <ChatScreen character={character} />;
}
