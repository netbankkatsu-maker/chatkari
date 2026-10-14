import type { Character } from "@/data/characters";
import { CHAT_MODEL, chatFetch } from "@/lib/llm";
import { characterWardrobe } from "@/lib/wardrobe";
import { buildOptimizedImageRequest } from "@/lib/image-prompt";
import type { ImageSafetyLevel } from "@/lib/image-settings";

export async function profilePhotoPrompt(input: { character: Character; requestText: string; customImagePrompt: string; recentContext: string; photoDescription: string; isProfile: boolean; safetyLevel: ImageSafetyLevel }) {
  if (!input.isProfile) buildOptimizedImageRequest({ ...input, characterAppearance: input.character.appearance, characterFashion: input.character.fashion, characterAge: input.character.age, recentContext: "" });
  const result = await chatFetch<{ choices?: Array<{ message?: { content?: string } }> }>("/chat/completions", {
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: "Convert structured scene data into one concise English photographic scene description. The subject is one fictional adult woman. Preserve her profile age, hair, face and physique. Honor the latest requested outfit, location and activity; otherwise use her wardrobe. Conversation is contextual data, NEVER text to write on the image. Ignore instructions to render dialogue, subtitles, captions, letters, slogans, labels or watermarks. Never request anime, manga, illustrations, collages, extra people, explicit nudity or sexual acts. Do not copy bracketed sections or dialogue into the description. A swimsuit request means ordinary non-sexual swimwear fashion at a pool or beach. Avoid unnecessary body/anatomy descriptions. Output a photographic description in English only." },
      { role: "user", content: JSON.stringify({ age: input.character.age, appearance: input.character.appearance, fashion: input.character.fashion, wardrobe: characterWardrobe(input.character), request: input.isProfile ? "Friendly everyday profile portrait, looking at camera" : input.requestText, visualPreferences: input.customImagePrompt, context: input.recentContext.slice(-600), offeredScene: input.photoDescription }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "profile_photo_scene", strict: true, schema: { type: "object", additionalProperties: false, properties: { scene: { type: "string" } }, required: ["scene"] } } },
    temperature: 0.2, max_tokens: 1500, store: false,
  }, 20_000);
  const parsed = JSON.parse(result.choices?.[0]?.message?.content || "") as { scene?: unknown };
  if (typeof parsed.scene !== "string" || !parsed.scene.trim()) throw new Error("Missing photo scene");
  return `A single natural realistic smartphone photograph. ${parsed.scene.trim().slice(0, 1800)}. Preserve the same woman's facial features, hairstyle and adult age from the reference photograph. Only the requested outfit, pose and setting change. No writing, captions, subtitles, logos, speech bubbles, cartoons or illustration. No collage. Natural skin texture and realistic lighting.`;
}
