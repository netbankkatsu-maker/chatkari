export type ImageReferenceSource = "conversation" | "profile" | "none";

const profileReferencePattern = /(?:プロフィール|プロフ)(?:写真|画像)?を?(?:参考|ベース|同じ顔)|profile\s*(?:photo|image|picture)/i;
const explicitImageReferencePattern = /(?:この|その|さっきの|前の|直前の|添付した)(?:画像|写真).{0,12}(?:加工|編集|修正|ベース|参考|引き継)|(?:画像|写真)を(?:加工|編集|修正|参考)|(?:edit|modify)\s+(?:this|that|the previous|the attached)\s+(?:image|photo|picture)/i;

export function referenceRequested(requestText: string, source: ImageReferenceSource) {
  if (source === "none") return false;
  if (source === "profile") return profileReferencePattern.test(requestText);
  return explicitImageReferencePattern.test(requestText);
}

export function chooseImageReference(input: {
  requestText: string;
  attachedImage?: string;
  conversationImage?: string;
  profileImage?: string;
}) {
  if (profileReferencePattern.test(input.requestText) && input.profileImage) {
    return { referenceImage: input.profileImage, referenceSource: "profile" as const };
  }
  if (explicitImageReferencePattern.test(input.requestText)) {
    const referenceImage = input.attachedImage || input.conversationImage;
    if (referenceImage) return { referenceImage, referenceSource: "conversation" as const };
  }
  return { referenceImage: undefined, referenceSource: "none" as const };
}
