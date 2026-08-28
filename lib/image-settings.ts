export type ImageProvider = "xai" | "modelslab";
export type ImageStyle = "realistic" | "anime";
export type ImageSafetyLevel = "standard" | "strict";

export type ImageGenerationSettings = {
  provider: ImageProvider;
  style: ImageStyle;
  samples: number;
  safetyLevel: ImageSafetyLevel;
};

export const DEFAULT_IMAGE_SETTINGS: ImageGenerationSettings = {
  provider: "xai",
  style: "realistic",
  samples: 1,
  safetyLevel: "standard",
};

export function sanitizeImageSettings(value: unknown): ImageGenerationSettings {
  const item = value && typeof value === "object" ? value as Partial<ImageGenerationSettings> : {};
  return {
    provider: item.provider === "modelslab" ? "modelslab" : "xai",
    style: item.style === "anime" ? "anime" : "realistic",
    samples: Math.max(1, Math.min(4, Math.round(Number(item.samples) || 1))),
    safetyLevel: "standard",
  };
}

export function loadImageSettings(): ImageGenerationSettings {
  try {
    return sanitizeImageSettings({
      provider: localStorage.getItem("chatkari:image-provider"),
      style: localStorage.getItem("chatkari:image-style"),
      samples: localStorage.getItem("chatkari:image-samples"),
      safetyLevel: "standard",
    });
  } catch {
    return DEFAULT_IMAGE_SETTINGS;
  }
}
