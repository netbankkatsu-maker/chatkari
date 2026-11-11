import { profilePhotoPrompt } from "@/lib/profile-photo";
import { profileImageFor } from "@/data/profile-images";
import { resolveCharacter } from "@/data/characters";
import { buildIdentityLock, buildOptimizedImageRequest, resolveClothingMode, UnsafeImagePromptError } from "@/lib/image-prompt";
import { playBasePrompt, playLeadPrompt, playNegativePrompt, playPromptAddons, resolvePlayCategories } from "@/lib/image-play";
import { cropGenitalCloseup } from "@/lib/crop-closeup";
import { referenceRequested } from "@/lib/image-reference";
import { sanitizeImageSettings } from "@/lib/image-settings";
import { generateSpicyImages, editSpicyProfilePhoto, publicSpicyError, SpicyApiError, SPICY_NEGATIVE_PROMPT, SPICY_STRICT_NEGATIVE_PROMPT } from "@/lib/spicy";

export const maxDuration = 120;

const REFERENCE_DATA_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function safeReferenceImage(value: unknown, requestUrl: string, source: unknown) {
  if (typeof value !== "string") return undefined;
  if (value.length <= 1_500_000 && REFERENCE_DATA_IMAGE.test(value)) return value;
  try {
    const baseUrl = new URL(requestUrl);
    const url = new URL(value, baseUrl);
    const isPublicProfile = baseUrl.protocol === "https:" && url.origin === baseUrl.origin && url.pathname.startsWith("/profiles/");
    const isConversationImage = source === "conversation" && url.protocol === "https:";
    return url.protocol === "https:" && (isPublicProfile || isConversationImage) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      characterId?: string;
      requestText?: string;
      recentContext?: string;
      mode?: "profile" | "chat";
      referenceImage?: string;
      character?: unknown;
      customImagePrompt?: string;
      photoDescription?: string;
      imageSettings?: unknown;
      referenceSource?: "conversation" | "profile" | "none";
      debug?: boolean;
    };
    const character = resolveCharacter(body.characterId, body.character);
    if (!character) return Response.json({ error: "キャラクターが見つかりません。" }, { status: 400 });

    const requestText = String(body.requestText || "").slice(0, 500);
    const imageSettings = sanitizeImageSettings(body.imageSettings);
    const isProfile = body.mode === "profile";
    const customImagePrompt = String(body.customImagePrompt || "").slice(0, 500);
    const recentContext = String(body.recentContext || "").slice(0, 1200);
    const photoDescription = String(body.photoDescription || "").slice(0, 500);
    // Ordinary photos use a clean visual scene and a real profile reference.
    // Unrelated adult conversation must not change the current photo's content.
    if (isProfile || resolveClothingMode(requestText, "", "standard", "") === "clothed") {
      const cleanPrompt = await profilePhotoPrompt({ character, requestText, customImagePrompt, recentContext, photoDescription, isProfile, safetyLevel: imageSettings.safetyLevel });
      const suppliedReference = safeReferenceImage(body.referenceImage, request.url, body.referenceSource);
      const defaultProfile = !isProfile ? profileImageFor(character.id) : undefined;
      const reference = !isProfile ? suppliedReference || (defaultProfile ? new URL(defaultProfile, request.url).href : undefined) : undefined;
      const generated = reference
        ? await editSpicyProfilePhoto({ prompt: cleanPrompt, referenceImage: reference, samples: imageSettings.samples })
        : await generateSpicyImages({ prompt: cleanPrompt, negativePrompt: "anime, manga, cartoon, illustration, subtitles, captions, text, letters, speech bubbles, watermark, logo, collage, duplicate person", samples: imageSettings.samples, style: "realistic", aspectRatio: "2:3" });
      return Response.json({ imageUrl: generated.urls[0], imageUrls: generated.urls, provider: "spicy", model: generated.model, referenceAttempted: Boolean(reference), referenceUsed: generated.referenceUsed });
    }
    const play = isProfile ? [] : resolvePlayCategories(`${requestText}\n${customImagePrompt}\n${photoDescription}\n${recentContext}`, requestText);
    const clothingMode = isProfile ? "clothed" : resolveClothingMode(requestText, customImagePrompt, imageSettings.safetyLevel, recentContext);
    const optimizedRequest = isProfile ? "" : buildOptimizedImageRequest({
      requestText,
      customImagePrompt,
      recentContext,
      photoDescription,
      safetyLevel: imageSettings.safetyLevel,
      characterAppearance: character.appearance,
      characterFashion: character.fashion,
      characterAge: character.age,
    });
    const scene = isProfile
      ? "friendly profile portrait for a fictional AI matching app, looking at camera, clean softly lit background, tasteful everyday outfit"
      : [optimizedRequest, playPromptAddons(play)].filter(Boolean).join("\n");
    const identity = buildIdentityLock({
      imagePrompt: character.imagePrompt,
      appearance: character.appearance,
      age: character.age,
    });
    const prompt = play.length
      ? playLeadPrompt(play, character.imagePrompt, character.age)
      : `${identity}\n${scene}\nsolo, 1girl, only one woman\nlook ${character.age} years old, realistic smartphone photography`;
    const requestedReference = safeReferenceImage(body.referenceImage, request.url, body.referenceSource);
    const referenceImage = play.length
      ? undefined
      : (referenceRequested(requestText, body.referenceSource || "none") ? requestedReference : undefined);
    const playPipeline = async () => {
      const baseNegative = imageSettings.safetyLevel === "strict" ? SPICY_STRICT_NEGATIVE_PROMPT : SPICY_NEGATIVE_PROMPT;
      const negativePrompt = playNegativePrompt(play, baseNegative);
      const category = play[0];
      const aspectRatio = category === "undies" || category === "closeup" ? "1:1" : "3:4";
      const request = {
        prompt,
        negativePrompt,
        style: imageSettings.style,
        aspectRatio,
      };
      const hardAct = category === "toy" || category === "semen" || category === "spread" || category === "anal";
      if (category === "closeup") {
        try {
          const poseBase = await generateSpicyImages({
            ...request,
            prompt: playBasePrompt("spread", character.imagePrompt, character.age),
            aspectRatio: "2:3",
            samples: 1,
            deadlineMs: 55_000,
          });
          const posed = await generateSpicyImages({
            ...request,
            prompt: playLeadPrompt(["spread"], character.imagePrompt, character.age),
            aspectRatio: "2:3",
            samples: 1,
            referenceImage: poseBase.urls[0],
            deadlineMs: 55_000,
          });
          const cropped = await cropGenitalCloseup(posed.urls[0]);
          return { urls: [cropped], referenceUsed: true, model: posed.model };
        } catch {
          const fallback = await generateSpicyImages({ ...request, samples: 1 });
          return { urls: fallback.urls, referenceUsed: fallback.referenceUsed, model: fallback.model };
        }
      }
      if (hardAct && category) {
        try {
          const nudeBase = await generateSpicyImages({
            ...request,
            prompt: playBasePrompt(category, character.imagePrompt, character.age),
            samples: 1,
            deadlineMs: 55_000,
          });
          const refined = await generateSpicyImages({
            ...request,
            samples: 1,
            referenceImage: nudeBase.urls[0],
            deadlineMs: 55_000,
          });
          return { urls: refined.urls, referenceUsed: true, model: refined.model };
        } catch {
          const fallback = await generateSpicyImages({ ...request, samples: 1 });
          return { urls: fallback.urls, referenceUsed: fallback.referenceUsed, model: fallback.model };
        }
      }
      const generated = await generateSpicyImages({ ...request, samples: 1, referenceImage });
      return { urls: generated.urls, referenceUsed: generated.referenceUsed, model: generated.model };
    };

    if (clothingMode === "explicit" || clothingMode === "nude" || play.length > 0) {
      const generated = await playPipeline();
      return Response.json({
        imageUrl: generated.urls[0],
        imageUrls: generated.urls,
        provider: "spicy",
        model: generated.model,
        referenceAttempted: Boolean(referenceImage),
        referenceUsed: generated.referenceUsed,
        ...(body.debug ? { debug: { prompt, play, clothingMode, modelId: generated.model, pipeline: "spicy-v1" } } : {}),
      });
    }
    const generated = await generateSpicyImages({
      prompt,
      negativePrompt: "blurry, distorted, watermark, text, collage, duplicate person",
      samples: imageSettings.samples,
      referenceImage,
      style: imageSettings.style,
      aspectRatio: "3:4",
    });
    return Response.json({
      imageUrl: generated.urls[0],
      imageUrls: generated.urls,
      provider: "spicy",
      model: generated.model,
      referenceAttempted: Boolean(referenceImage),
      referenceUsed: generated.referenceUsed,
    });
  } catch (error) {
    if (error instanceof UnsafeImagePromptError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof SpicyApiError) {
      if (error.status === 422) return Response.json({ error: "画像が制限されたか、空白・黒い画像が返されたため表示できませんでした。内容を変えてお試しください。" }, { status: 422 });
      if ([401, 403, 503].includes(error.status)) return Response.json({ error: "SpicyのAPI設定またはサービス状態を確認してください。" }, { status: 503 });
      if (error.status === 402) return Response.json({ error: "Spicyのクレジットが不足しています。残高を確認してください。" }, { status: 402 });
      if (error.status === 429) return Response.json({ error: "Spicyが混み合っています。少し待ってから試してください。" }, { status: 429 });
      if (error.status === 504) return Response.json({ error: "画像生成に時間がかかっています。もう一度試してください。" }, { status: 504 });
      return Response.json({ error: "画像を生成できませんでした。画像モデルと入力内容を確認してください。" }, { status: error.status === 400 ? 400 : 502 });
    }
    const response = publicSpicyError(error, "画像の生成に失敗しました。もう一度試してください。");
    return Response.json({ error: response.message }, { status: response.status });
  }
}
