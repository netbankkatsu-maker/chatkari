"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Character } from "@/data/characters";
import { ProfileImage } from "@/components/ProfileImage";
import { profileImageFor } from "@/data/profile-images";
import { MAX_GROUP_SIZE } from "@/lib/group";

const personalityHints: Record<string, string[]> = {
  おまかせ: [],
  "明るい・積極的": ["明るい", "積極", "社交", "ノリ", "人懐っこ"],
  "癒やし系・優しい": ["優しい", "癒", "穏やか", "聞き上手", "包容"],
  "クール・大人っぽい": ["クール", "大人", "しっかり", "知的"],
  "ツンデレ": ["ツン"],
  "S気質・主導的": ["S気質", "主導"],
  "M気質・甘えたがり": ["甘え", "M気質"],
  "人見知り・慎重": ["人見知り", "慎重", "おとなしい", "控えめ"],
};

function matchesPersonality(character: Character, personality: string) {
  const hints = personalityHints[personality] || [];
  if (!hints.length) return true;
  const haystack = `${character.personality.join(" ")} ${character.romanceStyle} ${character.speakingStyle}`;
  return hints.some((hint) => haystack.includes(hint));
}

function memberImage(character: Character) {
  return (typeof localStorage !== "undefined" ? localStorage.getItem(`chatkari:image:${character.id}`) : null) || profileImageFor(character.id) || undefined;
}

export function MatchPreferences({ pool, onClose, onGenerated, onPickGroup }: {
  pool: Character[];
  onClose: () => void;
  onGenerated: (characters: Character[]) => void;
  onPickGroup: (members: Character[]) => void;
}) {
  const [ageMin, setAgeMin] = useState(20);
  const [ageMax, setAgeMax] = useState(40);
  const [personality, setPersonality] = useState("おまかせ");
  const [relationshipStyle, setRelationshipStyle] = useState("自然に距離を縮めたい");
  const [adultPreference, setAdultPreference] = useState("");
  const [count, setCount] = useState(5);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const matches = useMemo(
    () => pool.filter((character) => character.age >= ageMin && character.age <= ageMax && matchesPersonality(character, personality)),
    [pool, ageMin, ageMax, personality],
  );

  const selectedMembers = selectedIds.flatMap((id) => matches.find((character) => character.id === id) || []);

  function toggle(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_GROUP_SIZE) return current;
      return [...current, id];
    });
  }

  function startWithSelected() {
    if (!selectedMembers.length) return;
    onPickGroup(selectedMembers);
  }

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
        <header><div><p className="eyebrow">MATCH SETTINGS</p><h2 id="preferences-title">好みから相手を選ぶ</h2></div><button type="button" onClick={onClose} aria-label="閉じる">×</button></header>
        <form onSubmit={submit}>
          <fieldset><legend>年齢層</legend><div className="age-range"><label>最低<input type="number" min={18} max={70} value={ageMin} onChange={(event) => setAgeMin(Number(event.target.value))} /></label><span>〜</span><label>最高<input type="number" min={18} max={75} value={ageMax} onChange={(event) => setAgeMax(Number(event.target.value))} /></label></div></fieldset>
          <label>性格<select value={personality} onChange={(event) => setPersonality(event.target.value)}><option>おまかせ</option><option>明るい・積極的</option><option>癒やし系・優しい</option><option>クール・大人っぽい</option><option>ツンデレ</option><option>S気質・主導的</option><option>M気質・甘えたがり</option><option>人見知り・慎重</option></select></label>
          <label>関係性・距離感<select value={relationshipStyle} onChange={(event) => setRelationshipStyle(event.target.value)}><option>自然に距離を縮めたい</option><option>友達感覚から始めたい</option><option>最初から積極的</option><option>ゆっくり信頼を作りたい</option><option>主導権を握ってほしい</option><option>甘えてほしい</option></select></label>
          <label>好み・性癖（成人同士の範囲）<textarea value={adultPreference} onChange={(event) => setAdultPreference(event.target.value)} maxLength={300} placeholder="例：Sっ気がある、下ネタに寛容、衣装の好みなど" /></label>
          {matches.length > 0 && (
            <fieldset className="preference-picks">
              <legend>今いる相手から選ぶ（最大{MAX_GROUP_SIZE}人）</legend>
              <p className="preferences-note">{matches.length}人が条件に合っています。複数人を選ぶとグループで話せます。</p>
              <div className="preference-pick-list">
                {matches.map((character) => {
                  const selected = selectedIds.includes(character.id);
                  return (
                    <button key={character.id} type="button" className={`preference-pick-item${selected ? " is-selected" : ""}`} onClick={() => toggle(character.id)} aria-pressed={selected}>
                      <ProfileImage character={character} imageUrl={memberImage(character)} size="small" />
                      <span><strong>{character.name}<small>{character.age}歳・{character.job}</small></strong><em>{character.personality.slice(0, 2).join("・")}</em></span>
                      <i aria-hidden="true">{selected ? "✓" : ""}</i>
                    </button>
                  );
                })}
              </div>
              <button className="preference-group-button" type="button" onClick={startWithSelected} disabled={!selectedMembers.length}>
                {selectedMembers.length >= 2 ? `選んだ${selectedMembers.length}人で話す` : selectedMembers.length === 1 ? "この人と話す" : "相手を選ぶ"}
              </button>
            </fieldset>
          )}
          <label>新しく作成する候補数<select value={count} onChange={(event) => setCount(Number(event.target.value))}>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}人</option>)}</select></label>
          <p className="preferences-note">新しい候補は全員18歳以上の架空キャラクターです。2〜{MAX_GROUP_SIZE}人作ると、そのままグループ選択できます。</p>
          {error && <p className="preferences-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={loading}>{loading ? "キャラクターを作成中…" : "この条件で候補を作る"}</button>
        </form>
      </section>
    </div>
  );
}
