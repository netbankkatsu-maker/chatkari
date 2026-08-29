export type ChatRole = "user" | "assistant";

export type ChatMessageData = {
  id: string;
  role: ChatRole;
  content: string;
  imageUrl?: string;
  audioId?: string;
  audioDuration?: number;
  speakerId?: string;
  speakerName?: string;
};

export type RecordedVoiceMessage = {
  blob: Blob;
  duration: number;
};

export type ChatReplyPart = {
  content: string;
  speakerId?: string;
  speakerName?: string;
};
