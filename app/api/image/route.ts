import { resolveCharacter } from "@/data/characters";
import { IMAGE_MODEL, publicApiError, XaiApiError, xaiFetch } from "@/lib/xai";
import { buildIdentityLock, buildOptimizedImageRequest, resolveClothingMode, UnsafeImagePromptError } from "@/lib/image-prompt";
import { playLeadPrompt, playLoras, playNegatives, playPromptAddons, playUsesPornModel, resolvePlayCategories } from "@/lib/image-play";
import { referenceRequested } from "@/lib/image-reference";
import { sanitizeImageSettings } from "@/lib/image-settings";
import { generateModelsLabImages, MODELSLAB_NEGATIVE_PROMPT, MODELSLAB_STRICT_NEGATIVE_PROMPT, ModelsLabApiError } from "@/lib/modelslab";

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
    };
    const character = resolveCharacter(body.characterId, body.character);
    if (!character) return Response.json({ error: "キャラクターが見つかりません。" }, { status: 400 });

    const requestText = String(body.requestText || "").slice(0, 500);
    const imageSettings = sanitizeImageSettings(body.imageSettings);
    const isProfile = body.mode === "profile";
    const customImagePrompt = String(body.customImagePrompt || "").slice(0, 500);
    const recentContext = String(body.recentContext || "").slice(0, 1200);
    const photoDescription = String(body.photoDescription || "").slice(0, 500);
    const play = isProfile ? [] : resolvePlayCategories(`${requestText}\n${customImagePrompt}\n${photoDescription}\n${recentContext}`);
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
      ? playLeadPrompt(play, character.appearance, character.age)
      : `${identity}\n${scene}\nsolo, 1girl, only one woman\nlook ${character.age} years old, realistic smartphone photography`;
    const requestedReference = safeReferenceImage(body.referenceImage, request.url, body.referenceSource);
    const referenceImage = play.length
      ? undefined
      : (referenceRequested(requestText, body.referenceSource || "none") ? requestedReference : undefined);
    const modelsLabFallback = async () => {
      const modelslabReference = referenceImage?.startsWith("data:image/") ? referenceImage.slice(referenceImage.indexOf(",") + 1) : referenceImage;
      const baseNegative = imageSettings.safetyLevel === "strict" ? MODELSLAB_STRICT_NEGATIVE_PROMPT : MODELSLAB_NEGATIVE_PROMPT;
      const anatomyNegative = "2girls, two women, two heads, extra arms, extra breasts, third breast, collage, giant, elongated body";
      const playNegative = playNegatives(play);
      const negativePrompt = `${baseNegative}, ${anatomyNegative}, ${playNegative}`;
      const loras = playLoras(play);
      return generateModelsLabImages({
        prompt,
        negativePrompt,
        style: imageSettings.style,
        samples: 1,
        referenceImage: modelslabReference,
        enableSafetyChecker: false,
        nsfwModel: playUsesPornModel(play) || clothingMode === "explicit" || clothingMode === "nude",
        loraModel: loras.loraModel,
        loraStrength: loras.loraStrength,
      });
    };

    if (imageSettings.provider === "modelslab" || clothingMode === "explicit" || clothingMode === "nude" || play.length > 0) {
      const generated = await modelsLabFallback();
      return Response.json({ imageUrl: generated.urls[0], imageUrls: generated.urls, provider: "modelslab", referenceAttempted: Boolean(referenceImage), referenceUsed: generated.referenceUsed });
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
