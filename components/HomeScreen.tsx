"use client";

import { useEffect, useRef, useState } from "react";
import { characters, sanitizeCharacter, type Character } from "@/data/characters";
import { CharacterEditor } from "@/components/CharacterEditor";
import { loadCharacterDirectory, saveDirectoryCharacter, deleteDirectoryCharacter, restoreDirectoryCharacter, deletedCharacterIds } from "@/lib/character-store";
import { AppTabBar } from "@/components/AppTabBar";
import { CharacterProfile } from "@/components/CharacterProfile";
import { GroupProfile } from "@/components/GroupProfile";
import { MatchPreferences } from "@/components/MatchPreferences";
import { ProfileImage } from "@/components/ProfileImage";
import { PROFILE_IMAGE_VERSION, profileImageFor } from "@/data/profile-images";
import { loadImageSettings } from "@/lib/image-settings";
import { MAX_GROUP_SIZE } from "@/lib/group";

type Preparation = { done: number; total: number };
const DEFAULT_MATCH_IDS = ["kirika", "mio", "naoko", "ayaka", "misaki", "rena", "rika", "mayu", "mai", "saori"];

function storedGeneratedCharacters() {
  try {
    const stored = JSON.parse(localStorage.getItem("chatkari:generated-characters") || "[]") as unknown[];
    return stored.flatMap((item) => {
      const character = sanitizeCharacter(item);
      return character ? [character] : [];
    });
  } catch { return []; }
}

async function prepareProfiles(candidates: Character[], onProgress: (progress: Preparation) => void) {
  const profileVersionChanged = localStorage.getItem("chatkari:profile-image-version") !== PROFILE_IMAGE_VERSION;
  for (const character of candidates) {
    const prebuilt = profileImageFor(character.id);
    if (prebuilt && (profileVersionChanged || !localStorage.getItem(`chatkari:image:${character.id}`))) localStorage.setItem(`chatkari:image:${character.id}`, prebuilt);
  }
  if (profileVersionChanged) localStorage.setItem("chatkari:profile-image-version", PROFILE_IMAGE_VERSION);
  let done = candidates.filter((character) => localStorage.getItem(`chatkari:image:${character.id}`)).length;
  let cursor = 0;
  const missing = candidates.filter((character) => !localStorage.getItem(`chatkari:image:${character.id}`));
  onProgress({ done, total: candidates.length });
  const customImagePrompt = localStorage.getItem("chatkari:image-guidance") || "";
  const imageSettings = { ...loadImageSettings(), samples: 1 };

  async function worker() {
    while (cursor < missing.length) {
      const character = missing[cursor++];
      try {
        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: character.id, character, mode: "profile", requestText: "プロフィール写真", customImagePrompt, imageSettings }),
        });
        const data = await response.json() as { imageUrl?: string };
        if (response.ok && data.imageUrl) localStorage.setItem(`chatkari:image:${character.id}`, data.imageUrl);
      } catch { /* Continue with the remaining profiles. */ }
      done += 1;
      onProgress({ done, total: candidates.length });
    }
  }

  await Promise.all(Array.from({ length: Math.min(5, missing.length) }, () => worker()));
}

export function HomeScreen() {
  const [pool, setPool] = useState<Character[]>(characters);
  const [match, setMatch] = useState<Character>();
  const [group, setGroup] = useState<Character[]>();
  const [imageUrl, setImageUrl] = useState<string>();
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<Character | null | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Character>();
  const [deleted, setDeleted] = useState<Character>();
  const [directoryError, setDirectoryError] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [preparation, setPreparation] = useState<Preparation>({ done: 0, total: characters.length });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const active = loadCharacterDirectory();
      setPool(active);
      setStorageReady(true);
      void prepareProfiles(active, setPreparation);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function selectMatch(selected: Character) {
    if (multiSelect) {
      setSelectedIds((current) => {
        if (current.includes(selected.id)) return current.filter((id) => id !== selected.id);
        if (current.length >= MAX_GROUP_SIZE) return current;
        return [...current, selected.id];
      });
      return;
    }
    const cached = localStorage.getItem(`chatkari:image:${selected.id}`) || profileImageFor(selected.id) || undefined;
    setImageUrl(cached);
    setMatch(selected);
  }

  function openSelectedGroup() {
    const selected = selectedIds.flatMap((id) => pool.find((character) => character.id === id) || []);
    if (selected.length === 1) {
      const cached = localStorage.getItem(`chatkari:image:${selected[0].id}`) || profileImageFor(selected[0].id) || undefined;
      setImageUrl(cached);
      setMatch(selected[0]);
      setMultiSelect(false);
      setSelectedIds([]);
      return;
    }
    if (selected.length < 2) return;
    setImageUrl(localStorage.getItem(`chatkari:image:${selected[0].id}`) || profileImageFor(selected[0].id) || undefined);
    setGroup(selected);
  }

  function useGeneratedCharacters(generated: Character[]) {
    const accumulated = [...new Map([...storedGeneratedCharacters(), ...generated].map((character) => [character.id, character])).values()];
    localStorage.setItem("chatkari:generated-characters", JSON.stringify(accumulated));
    setPool(loadCharacterDirectory());
    setVisibleCount((current) => current + generated.length);
    setPreferencesOpen(false);
    setMultiSelect(true);
    setSelectedIds(generated.length >= 2 && generated.length <= MAX_GROUP_SIZE ? generated.map((character) => character.id) : []);
    setPreparation({ done: 0, total: generated.length });
    void prepareProfiles(generated, setPreparation);
  }

  const profilesReady = preparation.total > 0 && preparation.done >= preparation.total;
  const orderedDefaults = DEFAULT_MATCH_IDS.flatMap((id) => pool.find((character) => character.id === id) || []);
  const remaining = pool.filter((character) => !DEFAULT_MATCH_IDS.includes(character.id));
  const visiblePool = [...orderedDefaults, ...remaining].slice(0, visibleCount);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || match || group || visibleCount >= pool.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisibleCount((current) => Math.min(pool.length, current + 10));
    }, { rootMargin: "200px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [visibleCount, pool.length, match, group]);

  function saveCharacter(next: Character) {
    const saved = saveDirectoryCharacter(next);
    setPool(loadCharacterDirectory());
    setVisibleCount((current) => Math.max(current, loadCharacterDirectory().length));
    if (match?.id === saved.id) setMatch(saved);
    setEditing(undefined);
  }
  function deleteCharacter(target: Character) {
    try {
      deleteDirectoryCharacter(target.id);
      setPool(loadCharacterDirectory());
      setSelectedIds((current) => current.filter((id) => id !== target.id));
      setMatch(undefined); setDeleteTarget(undefined); setDeleted(target);
    } catch { setDirectoryError("削除を保存できませんでした。"); }
  }
  const removedCharacters = storageReady ? loadCharacterDirectory(true).filter((character) => deletedCharacterIds().includes(character.id)) : [];
  const editor = editing !== undefined ? <CharacterEditor character={editing || undefined} onSave={saveCharacter} onClose={() => setEditing(undefined)} /> : null;
  const deleteDialog = deleteTarget ? <div className="preferences-overlay"><section className="preferences-sheet" role="dialog" aria-modal="true" aria-labelledby="delete-character-title"><h2 id="delete-character-title">{deleteTarget.name}を一覧から削除しますか？</h2><p>会話の履歴は保存されます。削除後に元に戻せます。</p><button className="secondary-button" onClick={() => deleteCharacter(deleteTarget)}>一覧から削除する</button><button className="text-button" onClick={() => setDeleteTarget(undefined)}>キャンセル</button>{directoryError && <p role="alert">{directoryError}</p>}</section></div> : null;

  if (group?.length) {
    const memberImages = Object.fromEntries(group.map((member) => [member.id, localStorage.getItem(`chatkari:image:${member.id}`) || profileImageFor(member.id) || undefined]));
    return <GroupProfile members={group} imageUrl={imageUrl} memberImages={memberImages} onBack={() => setGroup(undefined)} />;
  }

  if (match) {
    return (
      <main className="page-shell match-page">
        <header className="compact-header"><button className="text-button" onClick={() => setMatch(undefined)}>‹ 戻る</button><span>マッチしました</span><span /></header>
        <div className="character-manage-actions"><button onClick={() => setEditing(match)}>編集</button><button onClick={() => setDeleteTarget(match)}>削除</button></div>
        <CharacterProfile character={match} imageUrl={imageUrl} generating={!imageUrl && !profilesReady} />
        <button className="secondary-button" onClick={() => setMatch(undefined)}>一覧に戻る</button>
        {editor}{deleteDialog}
      </main>
    );
  }

  return (
    <main className={`home-page home-page--directory${multiSelect && selectedIds.length > 0 ? " home-page--picking" : ""}`}>
      <div className="home-glow home-glow--one" /><div className="home-glow home-glow--two" />
      <section className="match-directory">
        <header className="directory-header">
          <div><p className="eyebrow">FIND YOUR MATCH</p><h1>話したい相手を選ぶ</h1><p>{multiSelect ? `最大${MAX_GROUP_SIZE}人まで選べます。` : `${visiblePool.length}人のプロフィールから選べます。`}</p></div>
          <div className="directory-actions">
            <button type="button" className={multiSelect ? "is-active" : undefined} onClick={() => { setMultiSelect((current) => !current); setSelectedIds([]); }}>{multiSelect ? "1人に戻す" : "複数人"}</button>
            <button type="button" onClick={() => setPreferencesOpen(true)}>絞り込み</button>
            <button type="button" onClick={() => setEditing(null)}>追加</button>
          </div>
        </header>
        {!profilesReady && <p className="directory-progress">プロフィール写真を準備中 {preparation.done}/{preparation.total}</p>}
        <div className="match-choice-grid">
          {visiblePool.map((character, index) => {
            const cached = storageReady ? localStorage.getItem(`chatkari:image:${character.id}`) || profileImageFor(character.id) || undefined : profileImageFor(character.id) || undefined;
            return (
              <button key={character.id} type="button" className={`match-choice-card${selectedIds.includes(character.id) ? " is-selected" : ""}`} onClick={() => selectMatch(character)} aria-pressed={multiSelect ? selectedIds.includes(character.id) : undefined}>
                <ProfileImage character={character} imageUrl={cached} priority={index < 4} />
                {multiSelect && <span className="match-choice-check" aria-hidden="true">{selectedIds.includes(character.id) ? "✓" : ""}</span>}
                <span className="match-choice-overlay"><strong>{character.name}<small>{character.age}歳</small></strong><em>{character.job}</em><i>{character.personality.slice(0, 2).join("・")}</i></span>
              </button>
            );
          })}
        </div>
        <div ref={loadMoreRef} className="directory-load-more">{visibleCount < pool.length ? "スクロールすると続きを表示します" : "すべてのキャラクターを表示しました"}</div>
        {deleted && <p role="status">{deleted.name}を削除しました。<button onClick={() => { try { restoreDirectoryCharacter(deleted.id); setPool(loadCharacterDirectory()); setDeleted(undefined); } catch { setDirectoryError("復元できませんでした。"); } }}>元に戻す</button></p>}
        {removedCharacters.length > 0 && <details className="character-wardrobe"><summary>削除したキャラクター（{removedCharacters.length}人）</summary>{removedCharacters.map((character) => <p key={character.id}>{character.name}<button onClick={() => { try { restoreDirectoryCharacter(character.id); setPool(loadCharacterDirectory()); setDeleted(undefined); } catch { setDirectoryError("復元できませんでした。"); } }}>{character.name}を復元</button></p>)}</details>}
        {directoryError && <p role="alert">{directoryError}</p>}
        <p className="safety-note"><span>AI</span> 登場する人物はすべて18歳以上の架空キャラクターです</p>
      </section>
      {multiSelect && selectedIds.length > 0 && (
        <div className="group-select-bar">
          <p>{selectedIds.length}人選択中{selectedIds.length >= MAX_GROUP_SIZE ? "（上限）" : ""}</p>
          <button type="button" onClick={openSelectedGroup} disabled={selectedIds.length < 1}>{selectedIds.length >= 2 ? "この人数で話す" : "プロフィールを見る"}</button>
        </div>
      )}
      {preferencesOpen && (
        <MatchPreferences
          pool={pool}
          onClose={() => setPreferencesOpen(false)}
          onGenerated={useGeneratedCharacters}
          onPickGroup={(members) => {
            setPreferencesOpen(false);
            setSelectedIds([]);
            setMultiSelect(false);
            if (members.length === 1) {
              const selected = members[0];
              setImageUrl(localStorage.getItem(`chatkari:image:${selected.id}`) || profileImageFor(selected.id) || undefined);
              setMatch(selected);
              return;
            }
            setImageUrl(localStorage.getItem(`chatkari:image:${members[0].id}`) || profileImageFor(members[0].id) || undefined);
            setGroup(members);
          }}
        />
      )}
      {editor}{deleteDialog}
      <AppTabBar />
    </main>
  );
}
