import { resolveCharacter } from "@/data/characters";
import { characterPrompt, imageGenerationIntent, isAdultTopic, isVoiceRequest } from "@/lib/chat";
import { sanitizeMemories, sanitizeRelationship } from "@/lib/conversation";
import type { ChatMessageData } from "@/lib/types";
import { CHAT_MODEL, publicApiError, xaiFetch } from "@/lib/xai";

type ChatCompletion = { choices?: Array<{ message?: { content?: string } }> };

const DATA_IMAGE_PATTERN = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/;

function safeUserImage(value: unknown) {
  if (typeof value !== "string" || value.length > 1_500_000 || !DATA_IMAGE_PATTERN.test(value)) return undefined;
  return value;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      characterId?: string;
      messages?: ChatMessageData[];
      affection?: number;
      summary?: string;
      userDisplayName?: string;
      character?: unknown;
      conversationState?: unknown;
      memories?: unknown;
    };
    const character = resolveCharacter(body.characterId, body.character);
    if (!character) return Response.json({ error: "キャラクターが見つかりません。" }, { status: 400 });

    const messages = Array.isArray(body.messages)
      ? body.messages.flatMap((message) => {
        if ((message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") return [];
        return [{
          role: message.role,
          content: message.content.slice(0, 2000),
          imageUrl: message.role === "user" ? safeUserImage(message.imageUrl) : undefined,
        }];
      }).slice(-30)
      : [];
    const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
    const latestUser = latestUserMessage?.content.trim() || (latestUserMessage?.imageUrl ? "画像を送ったよ" : "");
    if (!latestUser || latestUser.length > 1000) {
      return Response.json({ error: "メッセージは1〜1000文字で入力してください。" }, { status: 400 });
    }

    const affection = Math.max(0, Math.min(100, Number(body.affection) || 20));
    const userDisplayName = typeof body.userDisplayName === "string" ? body.userDisplayName.replace(/[\r\n<>\{\}]/g, "").trim().slice(0, 24) : "";
    const relationship = sanitizeRelationship(body.conversationState, affection);
    const memories = sanitizeMemories(body.memories);
    const previousUserMessages = messages.filter((message) => message.role === "user" && message !== latestUserMessage).map((message) => message.content);
    const imageIntent = imageGenerationIntent(latestUser, previousUserMessages);
    const recentAssistant = messages.filter((message) => message.role === "assistant").slice(-3);
    const avoidQuestion = recentAssistant.filter((message) => /[？?]/.test(message.content)).length >= 2;
    const asksForDetail = /(詳しく|理由|どうして|説明して|相談|どう思う|教えて)/.test(latestUser);
    const replyLength = asksForDetail
      ? "long"
      : latestUser.length <= 28
        ? (Math.random() < 0.38 ? "short" : Math.random() < 0.86 ? "medium" : "long")
        : "medium";
    const system = characterPrompt(character, affection, userDisplayName, {
      relationship,
      memories,
      replyLength,
      avoidQuestion,
      recentOpenings: recentAssistant.map((message) => message.content.trim().slice(0, 18)).filter(Boolean),
      imageClarificationNeeded: imageIntent.needsClarification,
    }) + (body.summary ? `\n古い会話の要約: ${String(body.summary).slice(0, 2000)}` : "");
    const result = await xaiFetch<ChatCompletion>("/chat/completions", {
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: system },
        ...messages.map((message) => message === latestUserMessage && message.imageUrl
          ? {
            role: message.role,
            content: [
              { type: "image_url", image_url: { url: message.imageUrl, detail: "low" } },
              { type: "text", text: message.content || "この画像を見て、キャラクターらしく自然に反応して。" },
            ],
          }
          : { role: message.role, content: message.content }),
      ],
      store: false,
      temperature: 0.9,
      max_tokens: replyLength === "short" ? 100 : replyLength === "long" ? 380 : 230,
    }, 30_000);
    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Missing assistant message");

    const blocksRejectedImage = character.adultTopicPolicy === "reject" && isAdultTopic(latestUser);
    return Response.json({
      reply,
      replyParts: splitNaturalReply(reply),
      imageRequested: !blocksRejectedImage && imageIntent.shouldGenerate,
      voiceRequested: isVoiceRequest(latestUser),
    });
  } catch (error) {
    const response = publicApiError(error, "返信に失敗しました。もう一度試してください。");
    return Response.json({ error: response.message }, { status: response.status });
  }
}

export function splitNaturalReply(reply: string, random = Math.random) {
  const paragraphs = reply.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length >= 2 && paragraphs.length <= 3 && paragraphs.every((part) => part.length <= 180)) return paragraphs;
  if (random() > 0.28 || reply.length < 45 || reply.length > 360) return [reply];
  const sentences = reply.match(/[^。！？!?\n]+[。！？!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  if (sentences.length < 2) return [reply];
  const splitAt = Math.ceil(sentences.length / 2);
  return [sentences.slice(0, splitAt).join(""), sentences.slice(splitAt).join("")].filter(Boolean);
}
