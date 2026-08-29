"use client";

import { useEffect, useState } from "react";
import { loadAudio } from "@/lib/audio-store";
import type { ChatMessageData } from "@/lib/types";

function displaySrc(src: string, attempt = 0) {
  if (src.startsWith("data:") || src.startsWith("/api/")) return src;
  if (src.startsWith("/")) return src;
  const proxied = `/api/media?url=${encodeURIComponent(src)}`;
  return attempt ? `${proxied}&r=${attempt}` : proxied;
}

function ChatImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) return <p className="message-image-error">画像を表示できませんでした</p>;
  return (
    <div className="message-image">
      {/* Generated URLs come from ModelsLab/xAI CDNs; next/image blocked those as "?". */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={attempt}
        src={displaySrc(src, attempt)}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => {
          if (attempt === 0) setAttempt(1);
          else setFailed(true);
        }}
      />
    </div>
  );
}

export function ChatMessage({ message }: { message: ChatMessageData }) {
  const [audioUrl, setAudioUrl] = useState<string>();
  const [audioUnavailable, setAudioUnavailable] = useState(false);

  useEffect(() => {
    if (!message.audioId) return;
    let active = true;
    let objectUrl = "";
    loadAudio(message.audioId).then((blob) => {
      if (!active) return;
      if (!blob) return setAudioUnavailable(true);
      objectUrl = URL.createObjectURL(blob);
      setAudioUrl(objectUrl);
    }).catch(() => { if (active) setAudioUnavailable(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.audioId]);

  return (
    <div className={`message-row message-row--${message.role}`}>
      <div className="message-bubble">
        {message.audioId && (
          <div className="message-audio">
            <span className="message-audio-icon" aria-hidden="true">▶</span>
            {audioUrl ? <audio controls src={audioUrl} preload="metadata" aria-label={`${message.role === "user" ? "送信した" : "受信した"}ボイスメッセージ`} /> : <span className="message-audio-loading">{audioUnavailable ? "音声データを読み込めません" : "音声を読み込み中…"}</span>}
            {message.audioDuration && <small>{message.audioDuration}秒</small>}
          </div>
        )}
        {message.content && (message.audioId
          ? <details className="voice-transcript"><summary>{message.role === "user" ? "文字起こし" : "メッセージを見る"}</summary><p>{message.content}</p></details>
          : <p>{message.content}</p>)}
        {message.imageUrl && <ChatImage src={message.imageUrl} alt={message.role === "user" ? "ユーザーが送った画像" : "AIキャラクターが送った生成画像"} />}
      </div>
    </div>
  );
}
