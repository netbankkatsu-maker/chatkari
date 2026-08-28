export type ImageReferenceSource = "conversation" | "profile" | "none";

const profileReferencePattern = /(?:プロフィール|プロフ)(?:写真|画像)?|profile\s*(?:photo|image|picture)/i;
const explicitImageReferencePattern = /(?:(?:この|その|さっきの|前の|直前の|今の|送った|添付した)(?:画像|写真|絵|イラスト)|(?:画像|写真|絵|イラスト).{0,16}(?:加工|編集|修正|変え|ベース|参考|引き継|続き|同じ)|(?:this|that|previous|last|attached)\s+(?:image|photo|picture)|(?:edit|modify|change|use)\s+(?:this|that|the previous|the attached)\s+(?:image|photo|picture))/i;
const iterativeImagePattern = /(?:もう少し|もっと).{0,20}(?:大胆|控えめ|明る|暗く|近く|遠く|笑顔|表情|服|衣装|ポーズ|構図|背景|色|画質|リアル|アニメ)|(?:same image|another version|a little more|make it more)/i;

export function referenceRequested(requestText: string, source: ImageReferenceSource) {
  if (source === "none") return false;
  if (source === "profile") return profileReferencePattern.test(requestText);
  return explicitImageReferencePattern.test(requestText) || iterativeImagePattern.test(requestText);
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
  if ((explicitImageReferencePattern.test(input.requestText) || iterativeImagePattern.test(input.requestText))) {
    const referenceImage = input.attachedImage || input.conversationImage;
    if (referenceImage) return { referenceImage, referenceSource: "conversation" as const };
  }
  return { referenceImage: undefined, referenceSource: "none" as const };
}
