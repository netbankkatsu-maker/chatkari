"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppTabBar } from "@/components/AppTabBar";
import { ProfileImage } from "@/components/ProfileImage";
import { characters, sanitizeCharacter, type Character } from "@/data/characters";
import { profileImageFor } from "@/data/profile-images";
import { deleteAudioMessages } from "@/lib/audio-store";
import type { ChatMessageData } from "@/lib/types";

type ChatPreview = { character: Character; count: number; imageUrl?: string; lastMessage: string; updatedAt: number; audioIds: string[] };

function allCharacters() {
  let generated: Character[] = [];
  try {
    generated = (JSON.parse(localStorage.getItem("chatkari:generated-characters") || "[]") as unknown[]).flatMap((item) => {
      const character = sanitizeCharacter(item);
      return character ? [character] : [];
    });
  } catch { /* Ignore corrupt generated profiles. */ }
  return [...characters, ...generated].filter((character, index, list) => list.findIndex((item) => item.id === character.id) === index);
}

function formatUpdatedAt(value: number) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export function ChatListScreen() {
  const [previews, setPreviews] = useState<ChatPreview[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ChatPreview>();
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const next = allCharacters().flatMap((character) => {
        try {
          const stored = localStorage.getItem(`chatkari:chat:${character.id}`);
          if (!stored) return [];
          const parsed = JSON.parse(stored) as { messages?: ChatMessageData[]; updatedAt?: number };
          const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
          if (!messages.some((message) => message.role === "user")) return [];
          const last = messages.at(-1);
          return [{
            character,
            count: messages.length,
            imageUrl: localStorage.getItem(`chatkari:image:${character.id}`) || profileImageFor(character.id) || undefined,
            lastMessage: last?.content || (last?.audioId ? "ボイスメッセージ" : last?.imageUrl ? "写真" : "会話を始めました"),
            updatedAt: parsed.updatedAt || Number(last?.id.split("-")[0]) || 0,
            audioIds: messages.flatMap((message) => message.audioId ? [message.audioId] : []),
          }];
        } catch { return []; }
      }).sort((a, b) => b.updatedAt - a.updatedAt);
      setPreviews(next);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  async function deleteChat() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    localStorage.removeItem(`chatkari:chat:${deleteTarget.character.id}`);
    setPreviews((current) => current.filter((preview) => preview.character.id !== deleteTarget.character.id));
    try {
      await deleteAudioMessages(deleteTarget.audioIds);
    } catch { /* The text history is already removed; orphaned media is harmless. */ }
    setDeleting(false);
    setDeleteTarget(undefined);
  }

  return (
    <main className="page-shell chat-list-page">
      <header className="chat-list-header"><p className="eyebrow">CHAT ROOMS</p><h1>チャット</h1></header>
      {previews.length ? (
        <div className="chat-list">
          {previews.map((preview) => (
            <div key={preview.character.id} className="chat-list-item">
              <Link href={`/chat/${preview.character.id}`}>
                <ProfileImage character={preview.character} imageUrl={preview.imageUrl} size="small" />
                <div><strong>{preview.character.name}</strong><span>{preview.lastMessage}</span></div>
                <time dateTime={new Date(preview.updatedAt).toISOString()}>{formatUpdatedAt(preview.updatedAt)}</time>
              </Link>
              <button type="button" aria-label={`${preview.character.name}とのチャットを削除`} onClick={() => setDeleteTarget(preview)}>削除</button>
            </div>
          ))}
        </div>
      ) : <div className="chat-list-empty"><span aria-hidden="true">♡</span><strong>まだチャットはありません</strong><p>「探す」から相手を見つけて話しかけると、ここに会話が残ります。</p></div>}
      <p className="chat-list-storage-note">履歴はこの端末のBrave内に保存されます。</p>
      <AppTabBar />
      {deleteTarget && (
        <div className="delete-chat-overlay" role="presentation" onClick={() => !deleting && setDeleteTarget(undefined)}>
          <section className="delete-chat-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-chat-title">{deleteTarget.character.name}とのチャットを削除？</h2>
            <p>メッセージと保存済みボイスをこの端末から削除します。この操作は元に戻せません。</p>
            <div><button type="button" onClick={() => setDeleteTarget(undefined)} disabled={deleting}>キャンセル</button><button type="button" className="is-danger" onClick={() => void deleteChat()} disabled={deleting}>{deleting ? "削除中…" : "削除する"}</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
