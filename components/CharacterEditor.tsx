"use client";

import { useState, type FormEvent } from "react";
import { characters, type Character } from "@/data/characters";
import { characterWardrobe, type Wardrobe } from "@/lib/wardrobe";

const textFields = [
  ["name", "名前"], ["job", "職業"], ["maritalStatus", "婚姻状況"], ["introduction", "自己紹介"],
  ["romanceStyle", "関係性・距離感"], ["speakingStyle", "話し方"], ["appearance", "外見"], ["fashion", "服装傾向"],
  ["firstMessage", "最初のメッセージ"], ["imagePrompt", "プロフィール画像のイメージ"], ["profileNote", "会話スタイルの補足"],
] as const;
const closetFields = [["clothingPreferences", "好きな服の種類"], ["underwearPreferences", "好きな下着の種類"], ["clothes", "家にある服"], ["underwear", "家にある下着"]] as const;
const lines = (value: string) => value.split(/[\n、]/).map((entry) => entry.trim()).filter(Boolean);

export function CharacterEditor({ character, onSave, onClose }: { character?: Character; onSave: (character: Character) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Character>(() => character || { ...characters[0], id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", introduction: "", job: "", profileNote: "", firstMessage: "はじめまして。よろしくね。" });
  const [wardrobe, setWardrobe] = useState<Record<keyof Wardrobe, string>>(() => Object.fromEntries(Object.entries(characterWardrobe(character || characters[0])).map(([key, entries]) => [key, entries.join("\n")])) as Record<keyof Wardrobe, string>);
  const [personality, setPersonality] = useState(draft.personality.join("\n"));
  const [hobbies, setHobbies] = useState(draft.hobbies.join("\n"));
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    try { onSave({ ...draft, personality: lines(personality), hobbies: lines(hobbies), wardrobe: Object.fromEntries(Object.entries(wardrobe).map(([key, value]) => [key, lines(value)])) as Wardrobe }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした。"); }
  }
  return (
    <div className="preferences-overlay">
      <section className="preferences-sheet character-editor" role="dialog" aria-modal="true" aria-labelledby="character-editor-title">
        <header><h2 id="character-editor-title">{character ? "プロフィールを編集" : "キャラクターを追加"}</h2><button type="button" onClick={onClose} aria-label="編集を閉じる">×</button></header>
        <form onSubmit={submit}>
          {textFields.map(([key, label]) => <label key={key}>{label}<textarea required={key === "name" || key === "job"} maxLength={key === "imagePrompt" ? 700 : 240} value={draft[key] || ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
          <label>年齢<input type="number" required min={18} max={99} value={draft.age} onChange={(event) => setDraft((current) => ({ ...current, age: Number(event.target.value) }))} /></label>
          <label>性格（1行に1つ）<textarea value={personality} onChange={(event) => setPersonality(event.target.value)} /></label>
          <label>趣味（1行に1つ）<textarea value={hobbies} onChange={(event) => setHobbies(event.target.value)} /></label>
          <label>会話方針<select value={draft.conversationPolicy || "agreeable"} onChange={(event) => setDraft((current) => ({ ...current, conversationPolicy: event.target.value === "contrarian" ? "contrarian" : "agreeable" }))}><option value="agreeable">自然な会話</option><option value="contrarian">率直・批評的</option></select></label>
          <label>成人向け話題<select value={draft.adultTopicPolicy || "open"} onChange={(event) => setDraft((current) => ({ ...current, adultTopicPolicy: event.target.value === "reject" ? "reject" : "open" }))}><option value="open">許容する</option><option value="reject">拒否する</option></select></label>
          <label>写真リクエストへの反応<select value={draft.imageRequestStyle || "never"} onChange={(event) => setDraft((current) => ({ ...current, imageRequestStyle: event.target.value as Character["imageRequestStyle"] }))}><option value="never">控えめ</option><option value="playful">遊び心がある</option><option value="dominant">主導的</option></select></label>
          <fieldset><legend>好み・クローゼット（1行に1つ）</legend>{closetFields.map(([key, label]) => <label key={key}>{label}<textarea required value={wardrobe[key]} onChange={(event) => setWardrobe((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</fieldset>
          {error && <p role="alert" className="preferences-error">{error}</p>}
          <button type="submit" className="primary-button">保存する</button><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button>
        </form>
      </section>
    </div>
  );
}
