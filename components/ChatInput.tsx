"use client";

import Image from "next/image";
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { RecordedVoiceMessage } from "@/lib/types";

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_DATA_BYTES = 700_000;
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 45;
type MicPermission = PermissionState | "unknown" | "unsupported";

function dataUrlBytes(value: string) {
  return Math.ceil((value.length - value.indexOf(",") - 1) * 0.75);
}

function formatDuration(seconds: number) {
  return `0:${String(Math.max(0, seconds)).padStart(2, "0")}`;
}

async function prepareImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選んでください。");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("画像は12MB以下にしてください。");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を処理できませんでした。");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let quality = 0.82;
    let result = canvas.toDataURL("image/jpeg", quality);
    while (dataUrlBytes(result) > MAX_DATA_BYTES && quality > 0.42) {
      quality -= 0.1;
      result = canvas.toDataURL("image/jpeg", quality);
    }
    if (dataUrlBytes(result) > MAX_DATA_BYTES) throw new Error("画像を小さくしてからもう一度選んでください。");
    return result;
  } finally {
    bitmap.close();
  }
}

function preferredAudioType() {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export function ChatInput({ disabled, onSend }: {
  disabled: boolean;
  onSend: (text: string, imageUrl?: string, voice?: RecordedVoiceMessage) => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string>();
  const [inputError, setInputError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micPermission, setMicPermission] = useState<MicPermission>("unknown");
  const [showMicHelp, setShowMicHelp] = useState(false);
  const [voice, setVoice] = useState<(RecordedVoiceMessage & { url: string })>();
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const permissionStatusRef = useRef<PermissionStatus | null>(null);

  const readMicPermission = useCallback(async () => {
    if (!navigator.permissions?.query) {
      setMicPermission("unsupported");
      return "unsupported" as const;
    }
    try {
      const status = await navigator.permissions.query({ name: "microphone" } as PermissionDescriptor);
      permissionStatusRef.current = status;
      setMicPermission(status.state);
      status.onchange = () => {
        setMicPermission(status.state);
        if (status.state === "granted") setShowMicHelp(false);
      };
      return status.state;
    } catch {
      setMicPermission("unsupported");
      return "unsupported" as const;
    }
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartedRef.current) / 1000);
      setRecordingSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS && recorderRef.current?.state === "recording") recorderRef.current.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    if (permissionStatusRef.current) permissionStatusRef.current.onchange = null;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function clearVoice() {
    if (voice?.url) URL.revokeObjectURL(voice.url);
    setVoice(undefined);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim() || (imageUrl ? "画像を送ったよ" : "");
    if ((!value && !voice) || disabled || preparing || recording) return;
    const outgoingVoice = voice ? { blob: voice.blob, duration: voice.duration } : undefined;
    setInputError("");
    setText("");
    setImageUrl(undefined);
    setVoice(undefined);
    if (voice?.url) URL.revokeObjectURL(voice.url);
    if (fileRef.current) fileRef.current.value = "";
    void onSend(value, imageUrl, outgoingVoice);
  }

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setInputError("");
    setPreparing(true);
    try {
      setImageUrl(await prepareImage(file));
    } catch (error) {
      setImageUrl(undefined);
      setInputError(error instanceof Error ? error.message : "画像を読み込めませんでした。");
      event.target.value = "";
    } finally {
      setPreparing(false);
    }
  }

  async function startRecording() {
    setInputError("");
    setShowMicHelp(false);
    clearVoice();
    if (!window.isSecureContext) {
      setInputError("マイクはHTTPSで開いたページだけで使用できます。");
      setShowMicHelp(true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setInputError("このブラウザーはボイスメッセージ録音に対応していません。");
      setShowMicHelp(true);
      return;
    }
    const permission = await readMicPermission();
    if (permission === "denied") {
      setInputError("Chatkariのマイク権限がBraveでブロックされています。");
      setShowMicHelp(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      setMicPermission("granted");
      const mimeType = preferredAudioType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 96000 } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recordingStartedRef.current = Date.now();
      setRecordingSeconds(0);
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const duration = Math.max(1, Math.min(MAX_RECORDING_SECONDS, Math.round((Date.now() - recordingStartedRef.current) / 1000)));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (!blob.size) return setInputError("音声を録音できませんでした。");
        if (blob.size > MAX_AUDIO_BYTES) return setInputError("録音データが大きすぎます。45秒以内で録音してください。");
        setVoice({ blob, duration, url: URL.createObjectURL(blob) });
      };
      recorder.onerror = () => setInputError("録音中にエラーが発生しました。");
      recorder.start(250);
      setRecording(true);
    } catch (caught) {
      const name = caught instanceof DOMException ? caught.name : "";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") setInputError("使用できるマイクが見つかりません。端末側でBraveのマイク利用も許可してください。");
      else if (name === "NotReadableError" || name === "TrackStartError") setInputError("マイクを開始できません。他のアプリがマイクを使用していないか確認してください。");
      else if (name === "NotAllowedError" || name === "SecurityError") setInputError("マイクの利用が許可されませんでした。Braveのサイト権限を「許可」に変更してください。");
      else setInputError("マイクを使用できません。Braveと端末のマイク権限を確認してください。");
      await readMicPermission();
      setShowMicHelp(true);
    }
  }

  function toggleRecording() {
    if (recording) recorderRef.current?.stop();
    else void startRecording();
  }

  return (
    <form className="chat-input" onSubmit={submit}>
      {imageUrl && (
        <div className="chat-image-preview">
          <div><Image src={imageUrl} alt="送信する画像のプレビュー" fill sizes="80px" unoptimized /></div>
          <span>この画像を送信します<small>画像は会話への反応のためxAI APIへ送られます</small></span>
          <button type="button" onClick={() => setImageUrl(undefined)} aria-label="添付画像を削除">×</button>
        </div>
      )}
      {(recording || voice) && (
        <div className={`chat-voice-preview${recording ? " is-recording" : ""}`}>
          <span className="voice-pulse" aria-hidden="true" />
          <div><strong>{recording ? "録音中…" : "ボイスメッセージ"}</strong><small>{formatDuration(recording ? recordingSeconds : voice?.duration || 0)} / 0:45</small></div>
          {voice && <audio controls src={voice.url} preload="metadata" aria-label="録音したボイスメッセージ" />}
          {voice && <button type="button" onClick={clearVoice} aria-label="録音を削除">×</button>}
        </div>
      )}
      {inputError && <p className="chat-image-error" role="alert">{inputError}</p>}
      {showMicHelp && (
        <div className="mic-permission-help" role="note">
          <strong>Braveでマイクを許可する</strong>
          <ol><li>Braveの「設定」→「サイトの設定」→「マイク」を開く</li><li>マイクをONにし、chatkari.vercel.appを「許可」にする</li><li>このページへ戻って下のボタンを押す</li></ol>
          <small>端末の設定でも「Brave → マイク」が許可されている必要があります。現在のサイト権限: {micPermission === "granted" ? "許可" : micPermission === "denied" ? "ブロック" : "未確認"}</small>
          <button type="button" onClick={() => void startRecording()} disabled={disabled || preparing}>マイク権限をもう一度確認</button>
        </div>
      )}
      <input ref={fileRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} disabled={disabled || preparing || recording} />
      <button className="attach-button" type="button" onClick={() => fileRef.current?.click()} disabled={disabled || preparing || recording} aria-label="画像を添付">{preparing ? "…" : "+"}</button>
      <button className={`voice-button${recording ? " is-recording" : ""}`} type="button" onClick={toggleRecording} disabled={disabled || preparing} aria-label={recording ? "録音を停止" : "ボイスメッセージを録音"} aria-pressed={recording}>{recording ? "■" : "●"}</button>
      <input value={text} onChange={(event) => setText(event.target.value)} placeholder={recording ? "録音中…" : "メッセージ"} aria-label="メッセージ" maxLength={1000} disabled={disabled || recording} />
      <button className="send-button" type="submit" disabled={disabled || preparing || recording || (!text.trim() && !imageUrl && !voice)} aria-label="送信">↑</button>
    </form>
  );
}
