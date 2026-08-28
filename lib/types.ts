export type ChatRole = "user" | "assistant";

export type ChatMessageData = {
  id: string;
  role: ChatRole;
  content: string;
  imageUrl?: string;
  audioId?: string;
  audioDuration?: number;
};

export type RecordedVoiceMessage = {
  blob: Blob;
  duration: number;
};
