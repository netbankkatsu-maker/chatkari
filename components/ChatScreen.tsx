"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { Character } from "@/data/characters";
import type { ChatMessageData } from "@/lib/types";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessage } from "@/components/ChatMessage";
import { ProfileImage } from "@/components/ProfileImage";
import { profileImageFor } from "@/data/profile-images";
import { saveAudio } from "@/lib/audio-store";
import type { RecordedVoiceMessage } from "@/lib/types";
import {
  advanceRelationship,
  DEFAULT_RELATIONSHIP,
  rememberFromMessage,
  sanitizeMemories,
  sanitizeRelationship,
  type ConversationMemory,
  type RelationshipState,
} from "@/lib/conversation";
import { loadImageSettings } from "@/lib/image-settings";

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function activityText(status: "idle" | "transcribing" | "replying" | "voice" | "image", name: string) {
  if (status === "transcribing") return "ボイスを文字起こし中…";
  if (status === "voice") return `${name}がボイスを録音中…`;
  if (status === "image") return "画像を生成中…";
  return `${name}が入力中…`;
}

export function ChatScreen({ character }: { character: Character }) {
  const initial: ChatMessageData[] = [{ id: `first-${character.id}`, role: "assistant", content: character.firstMessage }];
  const [messages, setMessages] = useState<ChatMessageData[]>(initial);
  const [relationship, setRelationship] = useState<RelationshipState>(DEFAULT_RELATIONSHIP);
  const [memories, setMemories] = useState<ConversationMemory[]>([]);
  const [status, setStatus] = useState<"idle" | "transcribing" | "replying" | "voice" | "image">("idle");
  const [error, setError] = useState("");
  const [profileUrl, setProfileUrl] = useState<string>();
  const [userDisplayName, setUserDisplayName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const storageKey = `chatkari:chat:${character.id}`;
  const userNameKey = `chatkari:user-name:${character.id}`;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as { messages?: ChatMessageData[]; affection?: number; relationship?: unknown; memories?: unknown };
          if (Array.isArray(parsed.messages) && parsed.messages.length) setMessages(parsed.messages);
          setRelationship(sanitizeRelationship(parsed.relationship, parsed.affection ?? 20));
          setMemories(sanitizeMemories(parsed.memories));
        }
        const storedName = localStorage.getItem(userNameKey) || "";
        setUserDisplayName(storedName);
        setNameDraft(storedName);
        setProfileUrl(localStorage.getItem(`chatkari:image:${character.id}`) || profileImageFor(character.id) || undefined);
      } catch { /* Ignore corrupt local state. */ }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [character.id, storageKey, userNameKey]);

  function saveUserDisplayName(event: FormEvent) {
    event.preventDefault();
    const next = nameDraft.replace(/[\r\n<>\{\}]/g, "").trim().slice(0, 24);
    if (next) localStorage.setItem(userNameKey, next);
    else localStorage.removeItem(userNameKey);
    setUserDisplayName(next);
    setNameDraft(next);
    setNameDialogOpen(false);
  }

  useEffect(() => {
    if (!ready) return;
    let remainingStoredImages = 2;
    const persistedMessages = messages.slice(-60).reverse().map((message) => {
      if (message.role !== "user" || !message.imageUrl?.startsWith("data:image/")) return message;
      if (remainingStoredImages > 0) {
        remainingStoredImages -= 1;
        return message;
      }
      return { ...message, imageUrl: undefined };
    }).reverse();
    try {
      localStorage.setItem(storageKey, JSON.stringify({ messages: persistedMessages, affection: relationship.affection, relationship, memories, updatedAt: Date.now() }));
    } catch {
      const textOnlyMessages = persistedMessages.map((message) => message.role === "user" ? { ...message, imageUrl: undefined } : message);
      localStorage.setItem(storageKey, JSON.stringify({ messages: textOnlyMessages, affection: relationship.affection, relationship, memories, updatedAt: Date.now() }));
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, relationship, memories, ready, storageKey, status]);

  async function send(text: string, imageUrl?: string, voice?: RecordedVoiceMessage) {
    if (status !== "idle") return;
    setError("");

    try {
      const userMessageId = makeId();
      let messageText = text;
      let storedUserAudio = false;
      if (voice) {
        setStatus("transcribing");
        const form = new FormData();
        const extension = voice.blob.type.includes("mp4") ? "m4a" : voice.blob.type.includes("ogg") ? "ogg" : "webm";
        form.append("audio", voice.blob, `voice-message.${extension}`);
        const transcriptionResponse = await fetch("/api/voice/transcribe", { method: "POST", body: form });
        const transcription = await transcriptionResponse.json() as { transcript?: string; error?: string };
        if (!transcriptionResponse.ok || !transcription.transcript) throw new Error(transcription.error || "声を聞き取れませんでした。もう一度試してください。");
        messageText = [transcription.transcript, text].filter(Boolean).join("\n").slice(0, 1000);
        try {
          await saveAudio(userMessageId, voice.blob);
          storedUserAudio = true;
        } catch {
          setError("音声の端末保存に失敗したため、文字起こしだけを履歴に残します。");
        }
      }

      const userMessage: ChatMessageData = {
        id: userMessageId,
        role: "user",
        content: messageText,
        imageUrl,
        audioId: storedUserAudio ? userMessageId : undefined,
        audioDuration: storedUserAudio ? voice?.duration : undefined,
      };
      const nextMessages = [...messages, userMessage];
      const updatedRelationship = advanceRelationship(relationship, messageText);
      const updatedMemories = rememberFromMessage(memories, messageText);
      setMessages(nextMessages);
      setRelationship(updatedRelationship);
      setMemories(updatedMemories);
      setStatus("replying");

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          character,
          userDisplayName,
          messages: nextMessages.slice(-30).map((message) => message.id === userMessage.id ? message : { ...message, imageUrl: undefined }),
          affection: updatedRelationship.affection,
          conversationState: updatedRelationship,
          memories: updatedMemories,
        }),
      });
      const data = await response.json() as { reply?: string; replyParts?: string[]; imageRequested?: boolean; voiceRequested?: boolean; error?: string };
      if (!response.ok || !data.reply) throw new Error(data.error || "返信に失敗しました。もう一度試してください。");
      const replyParts = Array.isArray(data.replyParts) && data.replyParts.length
        ? data.replyParts.filter((part) => typeof part === "string" && part.trim()).slice(0, 3)
        : [data.reply];
      const replies = replyParts.map((content) => ({ id: makeId(), role: "assistant" as const, content }));
      for (const [index, reply] of replies.entries()) {
        if (index > 0) {
          setStatus("replying");
          await delay(350 + Math.random() * 650);
        }
        setMessages((current) => [...current, reply]);
      }

      if (voice || data.voiceRequested) {
        setStatus("voice");
        try {
          const voiceResponse = await fetch("/api/voice/synthesize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ characterId: character.id, character, text: data.reply }),
          });
          if (!voiceResponse.ok) {
            const voiceError = await voiceResponse.json().catch(() => ({})) as { error?: string };
            throw new Error(voiceError.error || "ボイス返信を生成できませんでした。");
          }
          const replyAudio = await voiceResponse.blob();
          const voiceTargetId = replies.at(-1)?.id;
          if (voiceTargetId) {
            await saveAudio(voiceTargetId, replyAudio);
            setMessages((current) => current.map((message) => message.id === voiceTargetId ? { ...message, audioId: voiceTargetId } : message));
          }
        } catch (voiceError) {
          setError(voiceError instanceof Error ? `${voiceError.message} テキスト返信は届いています。` : "ボイス返信を生成できませんでした。テキスト返信は届いています。");
        }
      }
      if (data.imageRequested) {
        setStatus("image");
        const imageGuidance = localStorage.getItem("chatkari:image-guidance") || "";
        const imageSettings = loadImageSettings();
        const conversationWindow = nextMessages.slice(-10);
        const recentContext = [...conversationWindow.map((message) => `${message.role}: ${message.content}${message.imageUrl ? " [この発言には画像がある]" : ""}`), `assistant: ${data.reply}`].join("\n");
        const conversationReference = [...conversationWindow].reverse().find((message) => message.imageUrl)?.imageUrl;
        const referenceImage = conversationReference || profileUrl;
        const referenceSource = conversationReference ? "conversation" : profileUrl ? "profile" : "none";
        const imageResponse = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: character.id, character, mode: "chat", requestText: text, recentContext, referenceImage, referenceSource, customImagePrompt: imageGuidance, imageSettings }),
        });
        const imageData = await imageResponse.json() as { imageUrl?: string; imageUrls?: string[]; error?: string };
        if (!imageResponse.ok || !imageData.imageUrl) throw new Error(imageData.error || "画像の生成に失敗しました。もう一度試してください。");
        const generatedImages = (imageData.imageUrls?.length ? imageData.imageUrls : [imageData.imageUrl]).slice(0, imageSettings.samples);
        setMessages((current) => [...current, ...generatedImages.map((generatedImage) => ({ id: makeId(), role: "assistant" as const, content: "", imageUrl: generatedImage }))]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "返信に失敗しました。もう一度試してください。");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <main className="chat-page">
      <header className="chat-header">
        <Link href="/chats" aria-label="チャット一覧へ戻る">‹</Link>
        <ProfileImage character={character} imageUrl={profileUrl} size="small" />
        <div className="chat-header-identity"><strong>{character.name}</strong><span><i /> オンライン</span></div>
        <button className="chat-name-button" type="button" onClick={() => { setNameDraft(userDisplayName); setNameDialogOpen(true); }}><span>あなたの呼び名</span><strong>{userDisplayName || "未設定"}</strong></button>
      </header>
      <div className="chat-messages">
        {messages.map((message) => <ChatMessage key={message.id} message={message} />)}
        {status !== "idle" && <div className="typing"><span /><span /><span /> {activityText(status, character.name)}</div>}
        {error && <div className="chat-error" role="alert">{error}</div>}
        <div ref={endRef} />
      </div>
      <ChatInput disabled={status !== "idle"} onSend={send} />
      {nameDialogOpen && (
        <div className="name-dialog-overlay" role="presentation" onClick={() => setNameDialogOpen(false)}>
          <form className="name-dialog" role="dialog" aria-modal="true" aria-labelledby="name-dialog-title" onSubmit={saveUserDisplayName} onClick={(event) => event.stopPropagation()}>
            <button className="name-dialog-close" type="button" aria-label="閉じる" onClick={() => setNameDialogOpen(false)}>×</button>
            <p className="eyebrow">CALL ME</p>
            <h2 id="name-dialog-title">{character.name}からの呼ばれ方</h2>
            <p>このキャラだけが使う、あなたの名前やあだ名を設定できます。</p>
            <label htmlFor="user-display-name">呼び名</label>
            <input id="user-display-name" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={24} autoFocus placeholder="例：かっちゃん、〇〇さん" />
            <button className="name-dialog-save" type="submit">保存する</button>
          </form>
        </div>
      )}
    </main>
  );
}
