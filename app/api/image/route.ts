import { profilePhotoPrompt } from "@/lib/profile-photo";
import { profileImageFor } from "@/data/profile-images";
import { resolveCharacter } from "@/data/characters";
import { IMAGE_MODEL, publicApiError, xaiFetch } from "@/lib/xai";
import { buildIdentityLock, buildOptimizedImageRequest, resolveClothingMode, UnsafeImagePromptError } from "@/lib/image-prompt";
import { playBasePrompt, playEngine, playFrame, playImg2ImgStrength, playLeadPrompt, playNeedsPartner, playNegativePrompt, playPromptAddons, playUsesPornModel, resolvePlayCategories } from "@/lib/image-play";
import { cropGenitalCloseup } from "@/lib/crop-closeup";
import { referenceRequested } from "@/lib/image-reference";
import { sanitizeImageSettings } from "@/lib/image-settings";
import { generateModelsLabImages, MODELSLAB_NEGATIVE_PROMPT, MODELSLAB_STRICT_NEGATIVE_PROMPT, ModelsLabApiError } from "@/lib/modelslab";
import { generateVeniceImages, editVeniceProfilePhoto, VENICE_IMAGE_EDIT_MODEL, VENICE_IMAGE_MODEL, VeniceApiError } from "@/lib/venice";

type ImageResponse = { data?: Array<{ url?: string; revised_prompt?: string; file_output?: { public_url?: string } }> };

export const maxDuration = 120;

const REFERENCE_DATA_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function safeReferenceImage(value: unknown, requestUrl: string, source: unknown) {
  if (typeof value !== "string") return undefined;
  if (value.length <= 1_500_000 && REFERENCE_DATA_IMAGE.test(value)) return value;
  try {
    const baseUrl = new URL(requestUrl);
    const url = new URL(value, baseUrl);
    const isXai = url.hostname === "x.ai" || url.hostname.endsWith(".x.ai");
    const isPublicProfile = baseUrl.protocol === "https:" && url.origin === baseUrl.origin && url.pathname.startsWith("/profiles/");
    const isConversationImage = source === "conversation" && url.protocol === "https:";
    return url.protocol === "https:" && (isXai || isPublicProfile || isConversationImage) ? url.href : undefined;
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
      debugModelId?: string;
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
    if (imageSettings.provider === "venice" && (isProfile || resolveClothingMode(requestText, "", "standard", "") === "clothed")) {
      const cleanPrompt = await profilePhotoPrompt({ character, requestText, customImagePrompt, recentContext, photoDescription, isProfile, safetyLevel: imageSettings.safetyLevel });
      const suppliedReference = safeReferenceImage(body.referenceImage, request.url, body.referenceSource);
      const defaultProfile = !isProfile ? profileImageFor(character.id) : undefined;
      const reference = !isProfile ? suppliedReference || (defaultProfile ? new URL(defaultProfile, request.url).href : undefined) : undefined;
      const generated = reference
        ? await editVeniceProfilePhoto({ prompt: cleanPrompt, referenceImage: reference, samples: imageSettings.samples, safetyLevel: imageSettings.safetyLevel })
        : await generateVeniceImages({ prompt: cleanPrompt, negativePrompt: "anime, manga, cartoon, illustration, subtitles, captions, text, letters, speech bubbles, watermark, logo, collage, duplicate person", samples: imageSettings.samples, style: "realistic", safetyLevel: imageSettings.safetyLevel });
      return Response.json({ imageUrl: generated.urls[0], imageUrls: generated.urls, provider: "venice", model: reference ? VENICE_IMAGE_EDIT_MODEL : VENICE_IMAGE_MODEL, referenceAttempted: Boolean(reference), referenceUsed: generated.referenceUsed });
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
    const modelsLabFallback = async () => {
      const modelslabReference = referenceImage?.startsWith("data:image/") ? referenceImage.slice(referenceImage.indexOf(",") + 1) : referenceImage;
      const baseNegative = imageSettings.safetyLevel === "strict" ? MODELSLAB_STRICT_NEGATIVE_PROMPT : MODELSLAB_NEGATIVE_PROMPT;
      const negativePrompt = playNegativePrompt(play, baseNegative);
      const engine = playEngine(play);
      const frame = playFrame(play, engine.sdxl);
      const debugModelId = body.debug && typeof body.debugModelId === "string" ? body.debugModelId.trim().slice(0, 80) : "";
      const category = play[0];
      const request = {
        prompt,
        negativePrompt,
        style: imageSettings.style,
        samples: 1 as const,
        enableSafetyChecker: false,
        nsfwModel: engine.nsfwModel || playUsesPornModel(play) || clothingMode === "explicit" || clothingMode === "nude",
        modelId: debugModelId || engine.modelId,
        loraModel: engine.loraModel,
        loraStrength: engine.loraStrength,
        guidanceScale: engine.sdxl ? 6 : category === "lingerie" || category === "undies" ? 8 : playNeedsPartner(play) ? 6.5 : undefined,
        width: frame.width,
        height: frame.height,
        clipSkip: engine.sdxl ? 1 : undefined,
      };
      const hardAct = category === "toy" || category === "semen" || category === "spread" || category === "anal";
      if (category === "closeup") {
        try {
          const poseBase = await generateModelsLabImages({
            ...request,
            prompt: playBasePrompt("spread", character.imagePrompt, character.age),
            modelId: "uber-realistic-porn-merge",
            nsfwModel: true,
            width: 512,
            height: 768,
            clipSkip: 2,
            guidanceScale: 7,
          });
          const posed = await generateModelsLabImages({
            ...request,
            prompt: playLeadPrompt(["spread"], character.imagePrompt, character.age),
            modelId: "uber-realistic-porn-merge",
            nsfwModel: true,
            width: 512,
            height: 768,
            clipSkip: 2,
            guidanceScale: 7,
            referenceImage: poseBase.urls[0],
            strength: 0.7,
          });
          const cropped = await cropGenitalCloseup(posed.urls[0]);
          return { urls: [cropped], referenceUsed: true };
        } catch {
          return generateModelsLabImages(request);
        }
      }
      if (hardAct && category) {
        try {
          const nudeBase = await generateModelsLabImages({
            ...request,
            prompt: playBasePrompt(category, character.imagePrompt, character.age),
          });
          return generateModelsLabImages({
            ...request,
            referenceImage: nudeBase.urls[0],
            strength: playImg2ImgStrength(category),
          });
        } catch {
          return generateModelsLabImages(request);
        }
      }
      return generateModelsLabImages({ ...request, referenceImage: modelslabReference });
    };

    if (imageSettings.provider === "venice") {
      const generated = await generateVeniceImages({
        prompt,
        negativePrompt: "blurry, distorted, watermark, text, collage, duplicate person",
        samples: imageSettings.samples,
        referenceImage,
        style: imageSettings.style,
        safetyLevel: imageSettings.safetyLevel,
      });
      return Response.json({
        imageUrl: generated.urls[0],
        imageUrls: generated.urls,
        provider: "venice",
        referenceAttempted: Boolean(referenceImage),
        referenceUsed: generated.referenceUsed,
      });
    }

    if (imageSettings.provider === "modelslab" || clothingMode === "explicit" || clothingMode === "nude" || play.length > 0) {
      const generated = await modelsLabFallback();
      return Response.json({
        imageUrl: generated.urls[0],
        imageUrls: generated.urls,
        provider: "modelslab",
        referenceAttempted: Boolean(referenceImage),
        referenceUsed: generated.referenceUsed,
        ...(body.debug ? { debug: { prompt, play, clothingMode, modelId: playEngine(play).modelId, pipeline: "kupa-v4" } } : {}),
      });
    }
    const path = referenceImage ? "/images/edits" : "/images/generations";
    const generationPayload = {
        model: IMAGE_MODEL,
        prompt,
        response_format: "url",
        resolution: "1k",
        quality: "low",
        aspect_ratio: "3:4",
        storage_options: { filename: `chatkari-${character.id}-${Date.now()}.jpg`, public_url: true },
      };
    const payload = referenceImage
      ? { ...generationPayload, image: { url: referenceImage } }
      : generationPayload;

    let result: ImageResponse;
    try {
      result = await xaiFetch<ImageResponse>(path, payload, 90_000);
    } catch (error) {
      try {
        const generated = await modelsLabFallback();
        return Response.json({ imageUrl: generated.urls[0], imageUrls: generated.urls, provider: "modelslab", referenceAttempted: Boolean(referenceImage), referenceUsed: generated.referenceUsed });
      } catch {
        throw error;
      }
    }
    const imageUrl = result.data?.[0]?.file_output?.public_url || result.data?.[0]?.url;
    if (!imageUrl) throw new Error("Missing generated image URL");
    return Response.json({ imageUrl, imageUrls: [imageUrl], provider: "xai", referenceAttempted: Boolean(referenceImage), referenceUsed: Boolean(referenceImage) });
  } catch (error) {
    if (error instanceof UnsafeImagePromptError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof VeniceApiError) {
      if (error.status === 422) return Response.json({ error: "Veniceが画像を制限したか、空白・黒い画像を返したため表示できませんでした。内容を変えてお試しください。" }, { status: 422 });
      if ([401, 403, 503].includes(error.status)) return Response.json({ error: "VeniceのAPI設定またはサービス状態を確認してください。" }, { status: 503 });
      if (error.status === 402) return Response.json({ error: "Veniceのクレジットが不足しています。残高を確認してください。" }, { status: 402 });
      if (error.status === 429) return Response.json({ error: "Veniceが混み合っています。少し待ってから試してください。" }, { status: 429 });
      if (error.status === 504) return Response.json({ error: "画像生成に時間がかかっています。もう一度試してください。" }, { status: 504 });
      return Response.json({ error: "Veniceで画像を生成できませんでした。画像モデルと入力内容を確認してください。" }, { status: error.status === 400 || error.status === 422 ? 400 : 502 });
    }
    if (error instanceof ModelsLabApiError) {
      if ([401, 403].includes(error.status)) return Response.json({ error: "ModelsLabのAPI設定を確認してください。" }, { status: 503 });
      if (error.status === 429) return Response.json({ error: "ModelsLabが混み合っています。少し待ってから試してください。" }, { status: 429 });
      if (error.status === 504) return Response.json({ error: "画像生成に時間がかかっています。もう一度試してください。" }, { status: 504 });
      const detail = error.message || "";
      if (/nsfw content detected|nsfw_content_detected|safety checker flagged/i.test(detail)) {
        return Response.json({ error: `画像生成サービス側で内容が制限されました。${detail}`.slice(0, 180) }, { status: 400 });
      }
      return Response.json({ error: detail || "ModelsLabで画像を生成できませんでした。" }, { status: 502 });
    }
    const response = publicApiError(error, "画像の生成に失敗しました。もう一度試してください。");
    return Response.json({ error: response.message }, { status: response.status });
  }
}
