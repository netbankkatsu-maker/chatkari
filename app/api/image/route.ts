import { resolveCharacter } from "@/data/characters";
import { IMAGE_MODEL, publicApiError, XaiApiError, xaiFetch } from "@/lib/xai";
import { buildOptimizedImageRequest, UnsafeImagePromptError } from "@/lib/image-prompt";
import { sanitizeImageSettings } from "@/lib/image-settings";
import { generateModelsLabImages, MODELSLAB_NEGATIVE_PROMPT, ModelsLabApiError } from "@/lib/modelslab";

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
    const optimizedRequest = isProfile ? "" : buildOptimizedImageRequest({
      requestText,
      customImagePrompt,
      recentContext: String(body.recentContext || "").slice(0, 1200),
    });
    const scene = isProfile
      ? "friendly profile portrait for a fictional AI matching app, looking at camera, clean softly lit background, tasteful everyday outfit"
      : optimizedRequest;
    const adultStyle = isProfile
      ? "tasteful everyday portrait"
      : "adult, sensual and flirtatious mood when requested, elegant boudoir-inspired styling with tasteful coverage, no visible genitals, no explicit sexual acts";
    const prompt = `${character.imagePrompt}\n${scene}\n${adultStyle}\nconsistent facial identity, realistic smartphone photography, clearly an adult age ${character.age}, no text, no watermark`;
    const referenceImage = safeReferenceImage(body.referenceImage, request.url, body.referenceSource);
    if (imageSettings.provider === "modelslab") {
      const modelslabReference = referenceImage?.startsWith("data:image/") ? referenceImage.slice(referenceImage.indexOf(",") + 1) : referenceImage;
      const generated = await generateModelsLabImages({
        prompt,
        negativePrompt: MODELSLAB_NEGATIVE_PROMPT,
        style: imageSettings.style,
        samples: isProfile ? 1 : imageSettings.samples,
        referenceImage: modelslabReference,
      });
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
      if (!canFallBackToGeneration) throw error;
      referenceUsed = false;
      result = await xaiFetch<ImageResponse>("/images/generations", generationPayload, 90_000);
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
      return Response.json({ error: "ModelsLabで画像を生成できませんでした。設定またはモデルを確認してください。" }, { status: 502 });
    }
    const response = publicApiError(error, "画像の生成に失敗しました。もう一度試してください。");
    return Response.json({ error: response.message }, { status: response.status });
  }
}
