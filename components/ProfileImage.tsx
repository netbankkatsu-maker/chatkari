"use client";

import Image from "next/image";
import type { Character } from "@/data/characters";
import { profileImageFor } from "@/data/profile-images";

export function ProfileImage({ character, imageUrl, priority = false, size = "large" }: {
  character: Character;
  imageUrl?: string;
  priority?: boolean;
  size?: "small" | "large";
}) {
  const resolvedImage = imageUrl || profileImageFor(character.id);
  return (
    <div className={`profile-image profile-image--${size}`} style={{ background: `linear-gradient(145deg, ${character.accent}, #f7d5dc)` }}>
      {resolvedImage ? (
        <Image src={resolvedImage} alt={`${character.name}のAI生成プロフィール画像`} fill sizes={size === "small" ? "48px" : "(max-width: 640px) 100vw, 420px"} priority={priority} unoptimized />
      ) : (
        <span aria-hidden="true">{character.name.slice(0, 1)}</span>
      )}
    </div>
  );
}
