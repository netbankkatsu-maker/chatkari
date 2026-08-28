import { resolveCharacter } from "@/data/characters";
import { IMAGE_MODEL, publicApiError, XaiApiError, xaiFetch } from "@/lib/xai";
import { buildIdentityLock, buildOptimizedImageRequest, UnsafeImagePromptError, wantsExplicitAdultImage } from "@/lib/image-prompt";
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
    const explicitRequested = !isProfile && imageSettings.safetyLevel === "standard" && wantsExplicitAdultImage(requestText, customImagePrompt, recentContext);
    const optimizedRequest = isProfile ? "" : buildOptimizedImageRequest({
      requestText,
      customImagePrompt,
      recentContext,
      safetyLevel: imageSettings.safetyLevel,
      characterAppearance: character.appearance,
      characterFashion: character.fashion,
      characterAge: character.age,
    });
    const scene = isProfile
      ? "friendly profile portrait for a fictional AI matching app, looking at camera, clean softly lit background, tasteful everyday outfit"
      : optimizedRequest;
    const adultStyle = isProfile
      ? "tasteful everyday portrait, fully clothed"
      : imageSettings.safetyLevel === "strict"
        ? "tasteful everyday fashion, non-sexual mood, full clothing coverage"
        : explicitRequested
          ? "follow the user's requested clothing, pose and explicitness exactly; keep correct human anatomy"
          : "keep the character clothed in the requested or default everyday outfit; do not make her nude; obey the specified pose";
    const identity = buildIdentityLock({
      imagePrompt: character.imagePrompt,
      appearance: character.appearance,
      age: character.age,
    });
    const prompt = `${identity}\n${scene}\n${adultStyle}\nKeep the locked identity for face, age, hairstyle and body. Only clothing, pose and location may change. Never invent extra arms, a second head, or a giant body. Do not recreate the profile portrait composition unless the user explicitly asks for it.\nexactly one woman, one head, one face, two arms and two legs, look ${character.age} years old, realistic smartphone photography, no text, no watermark`;
    const requestedReference = safeReferenceImage(body.referenceImage, request.url, body.referenceSource);
    const referenceImage = referenceRequested(requestText, body.referenceSource || "none") ? requestedReference : undefined;
    const modelsLabFallback = async () => {
      const modelslabReference = referenceImage?.startsWith("data:image/") ? referenceImage.slice(referenceImage.indexOf(",") + 1) : referenceImage;
      const baseNegative = imageSettings.safetyLevel === "strict" ? MODELSLAB_STRICT_NEGATIVE_PROMPT : MODELSLAB_NEGATIVE_PROMPT;
      const anatomyNegative = "two heads, extra head, second face, multiple faces, extra arms, giant, elongated body";
      const negativePrompt = (isProfile || imageSettings.safetyLevel === "strict" || !explicitRequested)
        ? `${baseNegative}, nude, naked, fully nude, unexpected nudity, ${anatomyNegative}`
        : `${baseNegative}, ${anatomyNegative}`;
      return generateModelsLabImages({
        prompt,
        negativePrompt,
        style: imageSettings.style,
        samples: isProfile ? 1 : imageSettings.samples,
        referenceImage: modelslabReference,
        enableSafetyChecker: imageSettings.safetyLevel === "strict",
      });
    };

    if (imageSettings.provider === "modelslab") {
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
    let referenceUsed = Boolean(referenceImage);
    try {
      result = await xaiFetch<ImageResponse>(path, payload, 90_000);
    } catch (error) {
      console.warn("[api/image] primary request failed", {
        characterId: character.id,
        mode: body.mode || "chat",
        operation: referenceImage ? "edit" : "generation",
        status: error instanceof XaiApiError ? error.status : 500,
        promptLength: prompt.length,
      });
      const canFallBackToGeneration = Boolean(referenceImage)
        && !(error instanceof XaiApiError && [401, 403, 429, 504].includes(error.status));
      if (canFallBackToGeneration) {
        referenceUsed = false;
        try {
          result = await xaiFetch<ImageResponse>("/images/generations", generationPayload, 90_000);
        } catch (generationError) {
          const generated = await modelsLabFallback();
          return Response.json({ imageUrl: generated.urls[0], imageUrls: generated.urls, provider: "modelslab", referenceAttempted: Boolean(referenceImage), referenceUsed: generated.referenceUsed });
        }
      } else {
        try {
          const generated = await modelsLabFallback();
          return Response.json({ imageUrl: generated.urls[0], imageUrls: generated.urls, provider: "modelslab", referenceAttempted: Boolean(referenceImage), referenceUsed: generated.referenceUsed });
        } catch {
          throw error;
        }
      }
    }
    const imageUrl = result.data?.[0]?.file_output?.public_url || result.data?.[0]?.url;
    if (!imageUrl) throw new Error("Missing generated image URL");
    return Response.json({ imageUrl, imageUrls: [imageUrl], provider: "xai", referenceAttempted: Boolean(referenceImage), referenceUsed });
  } catch (error) {
    if (error instanceof UnsafeImagePromptError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof ModelsLabApiError) {
      if ([401, 403].includes(error.status)) return Response.json({ error: "ModelsLabのAPI設定を確認してください。" }, { status: 503 });
      if (error.status === 429) return Response.json({ error: "ModelsLabが混み合っています。少し待ってから試してください。" }, { status: 429 });
      if (error.status === 504) return Response.json({ error: "画像生成に時間がかかっています。もう一度試してください。" }, { status: 504 });
      const detail = error.message || "";
      if (/nsfw|safety|explicit|adult content/i.test(detail)) {
        return Response.json({ error: "画像生成サービス側で内容が制限されました。表現を変えるか、別のサービス（xAI）を試してください。" }, { status: 400 });
      }
      return Response.json({ error: detail || "ModelsLabで画像を生成できませんでした。設定またはモデルを確認してください。" }, { status: 502 });
    }
    const response = publicApiError(error, "画像の生成に失敗しました。もう一度試してください。");
    return Response.json({ error: response.message }, { status: response.status });
  }
}
