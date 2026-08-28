"use client";

import { FormEvent, useState } from "react";
import type { Character } from "@/data/characters";

export function MatchPreferences({ onClose, onGenerated }: {
  onClose: () => void;
  onGenerated: (characters: Character[]) => void;
}) {
  const [ageMin, setAgeMin] = useState(20);
  const [ageMax, setAgeMax] = useState(40);
  const [personality, setPersonality] = useState("おまかせ");
  const [relationshipStyle, setRelationshipStyle] = useState("自然に距離を縮めたい");
  const [adultPreference, setAdultPreference] = useState("");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/characters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageMin, ageMax, personality, relationshipStyle, adultPreference, count }),
      });
      const data = await response.json() as { characters?: Character[]; error?: string };
      if (!response.ok || !data.characters?.length) throw new Error(data.error || "候補を生成できませんでした。");
      onGenerated(data.characters);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "候補を生成できませんでした。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="preferences-overlay" role="presentation" onClick={onClose}>
      <section className="preferences-sheet" role="dialog" aria-modal="true" aria-labelledby="preferences-title" onClick={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">MATCH SETTINGS</p><h2 id="preferences-title">好みから相手を作る</h2></div><button type="button" onClick={onClose} aria-label="閉じる">×</button></header>
        <form onSubmit={submit}>
          <fieldset><legend>年齢層</legend><div className="age-range"><label>最低<input type="number" min={18} max={70} value={ageMin} onChange={(event) => setAgeMin(Number(event.target.value))} /></label><span>〜</span><label>最高<input type="number" min={18} max={75} value={ageMax} onChange={(event) => setAgeMax(Number(event.target.value))} /></label></div></fieldset>
          <label>性格<select value={personality} onChange={(event) => setPersonality(event.target.value)}><option>おまかせ</option><option>明るい・積極的</option><option>癒やし系・優しい</option><option>クール・大人っぽい</option><option>ツンデレ</option><option>S気質・主導的</option><option>M気質・甘えたがり</option><option>人見知り・慎重</option></select></label>
          <label>関係性・距離感<select value={relationshipStyle} onChange={(event) => setRelationshipStyle(event.target.value)}><option>自然に距離を縮めたい</option><option>友達感覚から始めたい</option><option>最初から積極的</option><option>ゆっくり信頼を作りたい</option><option>主導権を握ってほしい</option><option>甘えてほしい</option></select></label>
          <label>好み・性癖（成人同士の範囲）<textarea value={adultPreference} onChange={(event) => setAdultPreference(event.target.value)} maxLength={300} placeholder="例：Sっ気がある、下ネタに寛容、衣装の好みなど" /></label>
          <label>作成する候補数<select value={count} onChange={(event) => setCount(Number(event.target.value))}>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}人</option>)}</select></label>
          <p className="preferences-note">全員18歳以上の架空キャラクターとして生成します。成人同士・同意のある範囲だけを設定へ反映します。</p>
          {error && <p className="preferences-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={loading}>{loading ? "キャラクターを作成中…" : "この条件で候補を作る"}</button>
        </form>
      </section>
    </div>
  );
}
