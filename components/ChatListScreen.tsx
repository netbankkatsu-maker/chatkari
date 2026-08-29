"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppTabBar } from "@/components/AppTabBar";
import { GroupAvatars } from "@/components/GroupProfile";
import { ProfileImage } from "@/components/ProfileImage";
import { profileImageFor } from "@/data/profile-images";
import { deleteAudioMessages } from "@/lib/audio-store";
import { allKnownCharacters, forgetGroup, groupTitle, isGroupRoom, memberIdsFromRoomId, rememberedGroupIds, resolveLocalCharacters } from "@/lib/group";
import type { ChatMessageData } from "@/lib/types";
import type { Character } from "@/data/characters";

type ChatPreview = {
  roomId: string;
  title: string;
  members: Character[];
  count: number;
  imageUrl?: string;
  memberImages: Record<string, string | undefined>;
  lastMessage: string;
  updatedAt: number;
  audioIds: string[];
};

function formatUpdatedAt(value: number) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function previewFromRoom(roomId: string, pool: Character[]): ChatPreview | undefined {
  try {
    const stored = localStorage.getItem(`chatkari:chat:${roomId}`);
    if (!stored) return undefined;
    const parsed = JSON.parse(stored) as { messages?: ChatMessageData[]; updatedAt?: number };
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    if (!messages.some((message) => message.role === "user")) return undefined;
    const members = isGroupRoom(roomId)
      ? resolveLocalCharacters(memberIdsFromRoomId(roomId), roomId)
      : pool.filter((character) => character.id === roomId);
    if (!members.length) return undefined;
    const last = messages.at(-1);
    const lastBody = last?.content || (last?.audioId ? "ボイスメッセージ" : last?.imageUrl ? "写真" : "会話を始めました");
    const memberImages = Object.fromEntries(members.map((member) => [member.id, localStorage.getItem(`chatkari:image:${member.id}`) || profileImageFor(member.id) || undefined]));
    return {
      roomId,
      title: groupTitle(members),
      members,
      count: messages.length,
      imageUrl: memberImages[members[0].id],
      memberImages,
      lastMessage: last?.role === "assistant" && last.speakerName ? `${last.speakerName}: ${lastBody}` : lastBody,
      updatedAt: parsed.updatedAt || Number(last?.id.split("-")[0]) || 0,
      audioIds: messages.flatMap((message) => message.audioId ? [message.audioId] : []),
    };
  } catch {
    return undefined;
  }
}

export function ChatListScreen() {
  const [previews, setPreviews] = useState<ChatPreview[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ChatPreview>();
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const pool = allKnownCharacters();
      const roomIds = new Set<string>([...pool.map((character) => character.id), ...rememberedGroupIds()]);
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith("chatkari:chat:")) roomIds.add(key.slice("chatkari:chat:".length));
      }
      const next = [...roomIds].flatMap((roomId) => {
        const preview = previewFromRoom(roomId, pool);
        return preview ? [preview] : [];
      }).sort((a, b) => b.updatedAt - a.updatedAt);
      setPreviews(next);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  async function deleteChat() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    localStorage.removeItem(`chatkari:chat:${deleteTarget.roomId}`);
    forgetGroup(deleteTarget.roomId);
    setPreviews((current) => current.filter((preview) => preview.roomId !== deleteTarget.roomId));
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
            <div key={preview.roomId} className="chat-list-item">
              <Link href={`/chat/${preview.roomId}`}>
                {preview.members.length >= 2
                  ? <GroupAvatars members={preview.members} images={preview.memberImages} size="tiny" />
                  : <ProfileImage character={preview.members[0]} imageUrl={preview.imageUrl} size="small" />}
                <div><strong>{preview.title}</strong><span>{preview.lastMessage}</span></div>
                <time dateTime={new Date(preview.updatedAt).toISOString()}>{formatUpdatedAt(preview.updatedAt)}</time>
              </Link>
              <button type="button" aria-label={`${preview.title}とのチャットを削除`} onClick={() => setDeleteTarget(preview)}>削除</button>
            </div>
          ))}
        </div>
      ) : <div className="chat-list-empty"><span aria-hidden="true">♡</span><strong>まだチャットはありません</strong><p>「探す」から相手を見つけて話しかけると、ここに会話が残ります。複数人を選ぶとグループになります。</p></div>}
      <p className="chat-list-storage-note">履歴はこの端末のBrave内に保存されます。</p>
      <AppTabBar />
      {deleteTarget && (
        <div className="delete-chat-overlay" role="presentation" onClick={() => !deleting && setDeleteTarget(undefined)}>
          <section className="delete-chat-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-chat-title">{deleteTarget.title}とのチャットを削除？</h2>
            <p>メッセージと保存済みボイスをこの端末から削除します。この操作は元に戻せません。</p>
            <div><button type="button" onClick={() => setDeleteTarget(undefined)} disabled={deleting}>キャンセル</button><button type="button" className="is-danger" onClick={() => void deleteChat()} disabled={deleting}>{deleting ? "削除中…" : "削除する"}</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
