"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Character } from "@/data/characters";
import type { ChatMessageData, ChatReplyPart } from "@/lib/types";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessage } from "@/components/ChatMessage";
import { GroupAvatars } from "@/components/GroupProfile";
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
import { allKnownCharacters, groupIdFromMembers, groupTitle, MAX_GROUP_SIZE, rememberGroup } from "@/lib/group";
import { loadImageSettings } from "@/lib/image-settings";
import { chooseImageReference } from "@/lib/image-reference";

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function typingDelay(text: string, first = false) {
  const chars = text.replace(/\s/g, "").length;
  const think = first ? 650 + Math.random() * 900 : 280 + Math.random() * 520;
  const type = Math.min(3800, 420 + chars * (48 + Math.random() * 28));
  return Math.round(think + type);
}

async function toStoredImage(url: string) {
  if (url.startsWith("data:image/")) return url;
  try {
    const response = await fetch(`/api/media?url=${encodeURIComponent(url)}`);
    if (!response.ok) return url;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > 900_000) return url;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

function activityText(status: "idle" | "transcribing" | "replying" | "voice" | "image", name: string) {
  if (status === "transcribing") return "ボイスを文字起こし中…";
  if (status === "voice") return `${name}がボイスを録音中…`;
  if (status === "image") return "画像を生成中…";
  return `${name}が入力中…`;
}

function storedImagesFor(members: Character[]) {
  return Object.fromEntries(members.map((member) => [member.id, localStorage.getItem(`chatkari:image:${member.id}`) || profileImageFor(member.id) || undefined]));
}

function firstMessages(members: Character[]): ChatMessageData[] {
  return members.map((member) => ({
    id: `first-${member.id}`,
    role: "assistant" as const,
    content: member.firstMessage,
    speakerId: member.id,
    speakerName: member.name,
  }));
}

function normalizeReplyParts(raw: unknown, reply: string, fallback: Character): ChatReplyPart[] {
  const source = Array.isArray(raw) && raw.length ? raw : [reply];
  return source.flatMap((part) => {
    if (typeof part === "string") {
      const content = part.trim();
      return content ? [{ content, speakerId: fallback.id, speakerName: fallback.name }] : [];
    }
    if (!part || typeof part !== "object") return [];
    const item = part as ChatReplyPart;
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!content) return [];
    return [{
      content,
      speakerId: typeof item.speakerId === "string" ? item.speakerId : fallback.id,
      speakerName: typeof item.speakerName === "string" ? item.speakerName : fallback.name,
    }];
  }).slice(0, 4);
}

export function ChatScreen({ character, members }: { character: Character; members?: Character[] }) {
  const router = useRouter();
  const party = useMemo(() => (members && members.length >= 2 ? members : [character]), [character, members]);
  const grouped = party.length >= 2;
  const roomId = groupIdFromMembers(party.map((member) => member.id)) || character.id;
  const initial = firstMessages(party);
  const [messages, setMessages] = useState<ChatMessageData[]>(initial);
  const [relationship, setRelationship] = useState<RelationshipState>(DEFAULT_RELATIONSHIP);
  const [memories, setMemories] = useState<ConversationMemory[]>([]);
  const [status, setStatus] = useState<"idle" | "transcribing" | "replying" | "voice" | "image">("idle");
  const [error, setError] = useState("");
  const [profileUrl, setProfileUrl] = useState<string>();
  const [memberImages, setMemberImages] = useState<Record<string, string | undefined>>({});
  const [userDisplayName, setUserDisplayName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingAdds, setPendingAdds] = useState<string[]>([]);
  const [addable, setAddable] = useState<Character[]>([]);
  const [ready, setReady] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const storageKey = `chatkari:chat:${roomId}`;
  const userNameKey = `chatkari:user-name:${roomId}`;
  const title = grouped ? groupTitle(party) : character.name;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as { messages?: ChatMessageData[]; affection?: number; relationship?: unknown; memories?: unknown };
          if (Array.isArray(parsed.messages) && parsed.messages.length) setMessages(parsed.messages);
          setRelationship(sanitizeRelationship(parsed.relationship, parsed.affection ?? 20));
          setMemories(sanitizeMemories(parsed.memories));
        } else {
          setMessages(firstMessages(party));
        }
        const storedName = localStorage.getItem(userNameKey) || "";
        setUserDisplayName(storedName);
        setNameDraft(storedName);
        setMemberImages(storedImagesFor(party));
        setProfileUrl(localStorage.getItem(`chatkari:image:${character.id}`) || profileImageFor(character.id) || undefined);
        setAddable(allKnownCharacters().filter((item) => !party.some((member) => member.id === item.id)));
        if (grouped) rememberGroup(roomId, party);
      } catch { /* Ignore corrupt local state. */ }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [character.id, grouped, party, roomId, storageKey, userNameKey]);

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
    let remainingStoredImages = { user: 2, assistant: 4 };
    const persistedMessages = messages.slice(-60).reverse().map((message) => {
      if (!message.imageUrl?.startsWith("data:image/")) return message;
      if (message.role === "user" && remainingStoredImages.user > 0) {
        remainingStoredImages.user -= 1;
        return message;
      }
      if (message.role === "assistant" && remainingStoredImages.assistant > 0) {
        remainingStoredImages.assistant -= 1;
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

  function togglePending(id: string) {
    setPendingAdds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (party.length + current.length >= MAX_GROUP_SIZE) return current;
      return [...current, id];
    });
  }

  function confirmAddMembers() {
    const extras = pendingAdds.flatMap((id) => addable.find((item) => item.id === id) || []);
    if (!extras.length) return;
    const nextParty = [...party, ...extras].slice(0, MAX_GROUP_SIZE);
    const nextId = groupIdFromMembers(nextParty.map((member) => member.id));
    const joinMessages = extras.map((member) => ({
      id: makeId(),
      role: "assistant" as const,
      content: member.firstMessage,
      speakerId: member.id,
      speakerName: member.name,
    }));
    const nextMessages = [...messages, ...joinMessages];
    try {
      localStorage.setItem(`chatkari:chat:${nextId}`, JSON.stringify({
        messages: nextMessages,
        affection: relationship.affection,
        relationship,
        memories,
        updatedAt: Date.now(),
      }));
      if (userDisplayName) localStorage.setItem(`chatkari:user-name:${nextId}`, userDisplayName);
    } catch { /* Storage may be full; navigation still works with first messages. */ }
    rememberGroup(nextId, nextParty);
    setAddOpen(false);
    setPendingAdds([]);
    router.push(`/chat/${nextId}`);
  }

  function speakerOf(message: ChatMessageData) {
    return party.find((member) => member.id === message.speakerId) || party[0];
  }

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
        messageText = [transcription.transcript, text].filter(Boolean).join("\n").slice(0, 4000);
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
      const waitingSince = Date.now();

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          character,
          members: grouped ? party : undefined,
          userDisplayName,
          messages: nextMessages.slice(grouped ? -48 : -30).map((message) => {
            if (message.role === "assistant" && message.imageUrl) {
              return { ...message, content: message.content?.trim() || "（写真を送った）", imageUrl: undefined };
            }
            if (message.id === userMessage.id) return message;
            return { ...message, imageUrl: undefined };
          }),
          affection: updatedRelationship.affection,
          conversationState: updatedRelationship,
          memories: updatedMemories,
        }),
      });
      const data = await response.json() as { reply?: string; replyParts?: ChatReplyPart[]; imageRequested?: boolean; voiceRequested?: boolean; photoSpeakerId?: string; error?: string };
      if (!response.ok || !data.reply) throw new Error(data.error || "返信に失敗しました。もう一度試してください。");
      const replyParts = normalizeReplyParts(data.replyParts, data.reply, character);
      const replies: ChatMessageData[] = replyParts.map((part) => ({
        id: makeId(),
        role: "assistant",
        content: part.content,
        speakerId: part.speakerId,
        speakerName: part.speakerName,
      }));
      for (const [index, reply] of replies.entries()) {
        const wait = typingDelay(reply.content, index === 0);
        const alreadyWaited = index === 0 ? Date.now() - waitingSince : 0;
        setStatus("replying");
        await delay(Math.max(index === 0 ? 480 : 320, wait - alreadyWaited));
        setMessages((current) => [...current, reply]);
      }

      const voiceSpeaker = party.find((member) => member.id === replies.at(-1)?.speakerId) || character;
      if (voice || data.voiceRequested) {
        setStatus("voice");
        try {
          const voiceResponse = await fetch("/api/voice/synthesize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ characterId: voiceSpeaker.id, character: voiceSpeaker, text: replies.at(-1)?.content || data.reply }),
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
        const photoSpeaker = party.find((member) => member.id === data.photoSpeakerId) || voiceSpeaker;
        const imageGuidance = localStorage.getItem("chatkari:image-guidance") || "";
        const imageSettings = loadImageSettings();
        const conversationWindow = nextMessages.slice(-10);
        const recentContext = [...conversationWindow.map((message) => `${message.role}: ${message.content}${message.imageUrl ? " [この発言には画像がある]" : ""}`), `assistant: ${data.reply}`].join("\n");
        const conversationReference = [...conversationWindow].reverse().find((message) => message.id !== userMessage.id && message.imageUrl)?.imageUrl;
        const speakerProfile = memberImages[photoSpeaker.id] || profileUrl;
        const { referenceImage, referenceSource } = chooseImageReference({
          requestText: text,
          attachedImage: imageUrl,
          conversationImage: conversationReference,
          profileImage: speakerProfile,
        });
        const imageResponse = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: photoSpeaker.id, character: photoSpeaker, mode: "chat", requestText: text, recentContext, photoDescription: data.reply, referenceImage, referenceSource, customImagePrompt: imageGuidance, imageSettings }),
        });
        const imageData = await imageResponse.json() as { imageUrl?: string; imageUrls?: string[]; error?: string };
        if (!imageResponse.ok || !imageData.imageUrl) throw new Error(imageData.error || "画像の生成に失敗しました。もう一度試してください。");
        const generatedImages = (imageData.imageUrls?.length ? imageData.imageUrls : [imageData.imageUrl]).slice(0, imageSettings.samples);
        const storedImages: string[] = [];
        for (const generatedImage of generatedImages) {
          storedImages.push(await toStoredImage(generatedImage));
        }
        setMessages((current) => [...current, ...storedImages.map((generatedImage) => ({
          id: makeId(),
          role: "assistant" as const,
          content: "",
          imageUrl: generatedImage,
          speakerId: photoSpeaker.id,
          speakerName: photoSpeaker.name,
        }))]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "返信に失敗しました。もう一度試してください。");
    } finally {
      setStatus("idle");
    }
  }

  const canAdd = party.length < MAX_GROUP_SIZE && addable.length > 0;

  return (
    <main className="chat-page">
      <header className="chat-header">
        <Link href="/chats" aria-label="チャット一覧へ戻る">‹</Link>
        {grouped
          ? <GroupAvatars members={party} images={memberImages} size="tiny" />
          : <ProfileImage character={character} imageUrl={profileUrl} size="small" />}
        <div className="chat-header-identity"><strong>{title}</strong><span><i /> {grouped ? `${party.length}人オンライン` : "オンライン"}</span></div>
        {canAdd && <button className="chat-add-button" type="button" onClick={() => { setPendingAdds([]); setAddOpen(true); }}>追加</button>}
        <button className="chat-name-button" type="button" onClick={() => { setNameDraft(userDisplayName); setNameDialogOpen(true); }}><span>あなたの呼び名</span><strong>{userDisplayName || "未設定"}</strong></button>
      </header>
      <div className="chat-messages">
        {messages.map((message) => {
          const speaker = message.role === "assistant" ? speakerOf(message) : undefined;
          return (
            <ChatMessage
              key={message.id}
              message={message}
              speaker={speaker}
              speakerImage={speaker ? memberImages[speaker.id] : undefined}
              grouped={grouped}
            />
          );
        })}
        {status !== "idle" && <div className="typing"><span /><span /><span /> {activityText(status, grouped ? "みんな" : character.name)}</div>}
        {error && <div className="chat-error" role="alert">{error}</div>}
        <div ref={endRef} />
      </div>
      <ChatInput disabled={status !== "idle"} onSend={send} />
      {nameDialogOpen && (
        <div className="name-dialog-overlay" role="presentation" onClick={() => setNameDialogOpen(false)}>
          <form className="name-dialog" role="dialog" aria-modal="true" aria-labelledby="name-dialog-title" onSubmit={saveUserDisplayName} onClick={(event) => event.stopPropagation()}>
            <button className="name-dialog-close" type="button" aria-label="閉じる" onClick={() => setNameDialogOpen(false)}>×</button>
            <p className="eyebrow">CALL ME</p>
            <h2 id="name-dialog-title">{grouped ? "グループからの呼ばれ方" : `${character.name}からの呼ばれ方`}</h2>
            <p>この会話だけが使う、あなたの名前やあだ名を設定できます。</p>
            <label htmlFor="user-display-name">呼び名</label>
            <input id="user-display-name" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={24} autoFocus placeholder="例：かっちゃん、〇〇さん" />
            <button className="name-dialog-save" type="submit">保存する</button>
          </form>
        </div>
      )}
      {addOpen && (
        <div className="name-dialog-overlay" role="presentation" onClick={() => setAddOpen(false)}>
          <section className="name-dialog add-member-dialog" role="dialog" aria-modal="true" aria-labelledby="add-member-title" onClick={(event) => event.stopPropagation()}>
            <button className="name-dialog-close" type="button" aria-label="閉じる" onClick={() => setAddOpen(false)}>×</button>
            <p className="eyebrow">ADD MEMBERS</p>
            <h2 id="add-member-title">人を追加する</h2>
            <p>最大{MAX_GROUP_SIZE}人まで。今は{party.length}人です。</p>
            <div className="add-member-grid">
              {addable.map((item) => {
                const selected = pendingAdds.includes(item.id);
                const disabled = !selected && party.length + pendingAdds.length >= MAX_GROUP_SIZE;
                return (
                  <button key={item.id} type="button" className={selected ? "is-selected" : undefined} disabled={disabled} onClick={() => togglePending(item.id)}>
                    <ProfileImage character={item} imageUrl={memberImages[item.id] || profileImageFor(item.id) || undefined} size="small" />
                    <span>{item.name}<small>{item.age}歳</small></span>
                  </button>
                );
              })}
            </div>
            <button className="name-dialog-save" type="button" disabled={!pendingAdds.length} onClick={confirmAddMembers}>
              {pendingAdds.length ? `${pendingAdds.length}人を追加して話す` : "追加する人を選ぶ"}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
