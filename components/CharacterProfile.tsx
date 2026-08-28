"use client";

import Link from "next/link";
import type { Character } from "@/data/characters";
import { ProfileImage } from "@/components/ProfileImage";
import { characterVoiceProfile } from "@/lib/voice";

export function CharacterProfile({ character, imageUrl, generating }: { character: Character; imageUrl?: string; generating?: boolean }) {
  return (
    <article className="match-card" aria-live="polite">
      <div className="match-photo-wrap">
        <ProfileImage character={character} imageUrl={imageUrl} priority />
        <div className="ai-badge">AIキャラクター</div>
        {generating && <div className="photo-loading"><span className="spinner" />プロフィール写真を生成中…</div>}
      </div>
      <div className="match-details">
        <div className="match-title"><h2>{character.name}</h2><span>{character.age}歳</span></div>
        <p className="job">{character.job}</p>
        <p className="intro">{character.introduction}</p>
        {character.profileNote && <p className="profile-note"><strong>会話スタイル</strong>{character.profileNote}</p>}
        <dl className="profile-list">
          <div><dt>性格</dt><dd>{character.personality.join("・")}</dd></div>
          <div><dt>趣味</dt><dd>{character.hobbies.join("・")}</dd></div>
          <div><dt>声</dt><dd>{characterVoiceProfile(character).label}</dd></div>
        </dl>
        <Link className="primary-button" href={`/chat/${character.id}`}>チャットを始める</Link>
      </div>
    </article>
  );
}
