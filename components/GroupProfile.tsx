"use client";

import Link from "next/link";
import type { Character } from "@/data/characters";
import { ProfileImage } from "@/components/ProfileImage";
import { groupIdFromMembers, groupSubtitle, groupTitle, rememberGroup } from "@/lib/group";
import { characterVoiceProfile } from "@/lib/voice";
import { profileImageFor } from "@/data/profile-images";

export function GroupAvatars({ members, images = {}, size = "small" }: {
  members: Character[];
  images?: Record<string, string | undefined>;
  size?: "small" | "tiny";
}) {
  return (
    <div className={`group-stack group-stack--${size}`} aria-hidden="true">
      {members.slice(0, 4).map((member) => (
        <ProfileImage
          key={member.id}
          character={member}
          imageUrl={images[member.id] || profileImageFor(member.id) || undefined}
          size="small"
        />
      ))}
    </div>
  );
}

export function GroupProfile({ members, imageUrl, memberImages = {}, onBack }: {
  members: Character[];
  imageUrl?: string;
  memberImages?: Record<string, string | undefined>;
  onBack: () => void;
}) {
  const roomId = groupIdFromMembers(members.map((member) => member.id));
  const lead = members[0];
  if (!lead) return null;

  return (
    <main className="page-shell match-page">
      <header className="compact-header"><button className="text-button" onClick={onBack}>‹ 戻る</button><span>{members.length}人グループ</span><span /></header>
      <article className="match-card">
        <div className="match-photo-wrap">
          <ProfileImage character={lead} imageUrl={imageUrl} priority />
          <div className="ai-badge">{members.length}人</div>
          <div className="group-hero-stack">
            <GroupAvatars members={members} images={memberImages} size="tiny" />
          </div>
        </div>
        <div className="match-details">
          <div className="match-title"><h2>{groupTitle(members)}</h2><span>{groupSubtitle(members)}</span></div>
          <p className="intro">{members.map((member) => member.name).join("、")}と一緒に話せます。代表写真は1枚、下に全員のプロフィールがあります。</p>
          <Link className="primary-button" href={`/chat/${roomId}`} onClick={() => rememberGroup(roomId, members)}>チャットを始める</Link>
        </div>
      </article>
      <section className="group-member-list">
        <h3>メンバー</h3>
        {members.map((member) => (
          <article key={member.id} className="group-member-card">
            <ProfileImage character={member} imageUrl={memberImages[member.id] || profileImageFor(member.id) || undefined} size="small" />
            <div>
              <strong>{member.name}<small>{member.age}歳・{member.job}</small></strong>
              <p>{member.introduction}</p>
              <span>{member.personality.slice(0, 3).join("・")}</span>
              <em>{characterVoiceProfile(member).label}</em>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
