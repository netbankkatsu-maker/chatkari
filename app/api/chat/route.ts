import { resolveCharacter } from "@/data/characters";
import {
  characterPrompt,
  fillPromptForMissing,
  groupPrompt,
  imageGenerationIntent,
  isAdultTopic,
  isVoiceRequest,
  mergeGroupParts,
  missingGroupMembers,
  parseGroupReply,
  quietMemberNames,
  speakerForPhoto,
} from "@/lib/chat";
import { sanitizeMemories, sanitizeRelationship } from "@/lib/conversation";
import type { ChatMessageData } from "@/lib/types";
import { CHAT_MODEL, publicApiError, xaiFetch } from "@/lib/xai";

type ChatCompletion = { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };

const DATA_IMAGE_PATTERN = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const MAX_MESSAGE_CHARACTERS = 4000;

export const maxDuration = 60;

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
      members?: unknown;
      conversationState?: unknown;
      memories?: unknown;
    };
    const character = resolveCharacter(body.characterId, body.character);
    if (!character) return Response.json({ error: "キャラクターが見つかりません。" }, { status: 400 });
    const members = (Array.isArray(body.members) ? body.members : []).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const id = String((item as { id?: string }).id || "");
      const resolved = resolveCharacter(id, item);
      return resolved ? [resolved] : [];
    }).filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index).slice(0, 4);
    const party = members.length >= 2 ? members : [character];
    const grouped = party.length >= 2;
    const historyLimit = grouped ? Math.min(48, party.length * 12) : 30;

    const latestRawUserMessage = Array.isArray(body.messages)
      ? [...body.messages].reverse().find((message) => message?.role === "user" && typeof message.content === "string")
      : undefined;
    if (latestRawUserMessage && latestRawUserMessage.content.length > MAX_MESSAGE_CHARACTERS) {
      return Response.json({ error: `メッセージは1〜${MAX_MESSAGE_CHARACTERS}文字で入力してください。` }, { status: 400 });
    }

    const messages = Array.isArray(body.messages)
      ? body.messages.flatMap((message) => {
        if ((message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") return [];
        return [{
          role: message.role,
          content: message.role === "assistant" && message.speakerName
            ? `${message.speakerName}: ${message.content.slice(0, MAX_MESSAGE_CHARACTERS)}`
            : message.content.slice(0, MAX_MESSAGE_CHARACTERS),
          imageUrl: message.role === "user" ? safeUserImage(message.imageUrl) : undefined,
          speakerId: typeof message.speakerId === "string" ? message.speakerId : undefined,
        }];
      }).slice(-historyLimit)
      : [];
    const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
    const latestUser = latestUserMessage?.content.trim() || (latestUserMessage?.imageUrl ? "画像を送ったよ" : "");
    if (!latestUser) {
      return Response.json({ error: `メッセージは1〜${MAX_MESSAGE_CHARACTERS}文字で入力してください。` }, { status: 400 });
    }

    const affection = Math.max(0, Math.min(100, Number(body.affection) || 20));
    const userDisplayName = typeof body.userDisplayName === "string" ? body.userDisplayName.replace(/[\r\n<>\{\}]/g, "").trim().slice(0, 24) : "";
    const relationship = sanitizeRelationship(body.conversationState, affection);
    const memories = sanitizeMemories(body.memories);
    const previousUserMessages = messages.filter((message) => message.role === "user" && message !== latestUserMessage).map((message) => message.content);
    const imageIntent = imageGenerationIntent(latestUser, previousUserMessages);
    const recentAssistant = messages.filter((message) => message.role === "assistant").slice(-Math.max(3, party.length));
    const avoidQuestion = recentAssistant.filter((message) => /[？?]/.test(message.content)).length >= 2;
    const asksForDetail = /(詳しく|理由|どうして|説明して|相談|どう思う|教えて)/.test(latestUser);
    const replyLength = grouped
      ? "medium"
      : asksForDetail
        ? "long"
        : latestUser.length <= 28
          ? (Math.random() < 0.38 ? "short" : Math.random() < 0.86 ? "medium" : "long")
          : "medium";
    const quietNames = grouped
      ? quietMemberNames(party, messages.filter((message) => message.role === "assistant" && message.speakerId).map((message) => message.speakerId as string).slice(-party.length * 4))
      : [];
    const system = (grouped
      ? groupPrompt(party, affection, userDisplayName, {
        relationship,
        memories,
        replyLength,
        avoidQuestion,
        recentOpenings: recentAssistant.map((message) => message.content.trim().slice(0, 18)).filter(Boolean),
        imageClarificationNeeded: imageIntent.needsClarification,
        quietNames,
      })
      : characterPrompt(character, affection, userDisplayName, {
        relationship,
        memories,
        replyLength,
        avoidQuestion,
        recentOpenings: recentAssistant.map((message) => message.content.trim().slice(0, 18)).filter(Boolean),
        imageClarificationNeeded: imageIntent.needsClarification,
      })) + (body.summary ? `\n古い会話の要約: ${String(body.summary).slice(0, 2000)}` : "");
    const completionMessages = [
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
    ];
    const maxTokens = grouped
      ? Math.min(1100, 220 * party.length + 80)
      : replyLength === "short" ? 180 : replyLength === "long" ? 700 : 420;
    const result = await xaiFetch<ChatCompletion>("/chat/completions", {
      model: CHAT_MODEL,
      messages: completionMessages,
      store: false,
      temperature: grouped ? 0.82 : 0.9,
      max_tokens: maxTokens,
    }, 30_000);
    const firstChoice = result.choices?.[0];
    let reply = firstChoice?.message?.content?.trim();
    if (!reply) throw new Error("Missing assistant message");
    if (firstChoice?.finish_reason === "length") {
      const continuationResult = await xaiFetch<ChatCompletion>("/chat/completions", {
        model: CHAT_MODEL,
        messages: [
          ...completionMessages,
          { role: "assistant", content: reply },
          { role: "user", content: grouped
            ? `直前の返答が途中で切れました。まだ出ていない人も含め、残りの発言を「名前: 本文」形式で続けて全員分を完結させてください。既に出した発言は繰り返さない。`
            : "直前の返答が途中で切れました。内容を繰り返さず、途切れた箇所の直後から自然に続け、文章を完結させてください。" },
        ],
        store: false,
        temperature: 0.75,
        max_tokens: grouped ? Math.min(700, 180 * party.length) : 700,
      }, 30_000);
      const continuation = continuationResult.choices?.[0]?.message?.content?.trim();
      if (continuation) reply += `\n${continuation}`;
    }

    const photoSpeaker = speakerForPhoto(latestUser, party, [...(body.messages || [])].reverse().find((message) => message?.role === "assistant" && typeof message.speakerId === "string")?.speakerId);
    const blocksRejectedImage = (photoSpeaker || character).adultTopicPolicy === "reject" && isAdultTopic(latestUser);
    let replyParts = grouped
      ? parseGroupReply(reply, party)
      : splitNaturalReply(reply).map((content) => ({ content, speakerId: character.id, speakerName: character.name }));
    if (grouped) {
      const missing = missingGroupMembers(replyParts, party);
      if (missing.length) {
        try {
          const fillResult = await xaiFetch<ChatCompletion>("/chat/completions", {
            model: CHAT_MODEL,
            messages: [
              ...completionMessages,
              { role: "assistant", content: reply },
              { role: "user", content: fillPromptForMissing(missing, replyParts) },
            ],
            store: false,
            temperature: 0.8,
            max_tokens: Math.min(500, 140 * missing.length + 60),
          }, 20_000);
          const fill = fillResult.choices?.[0]?.message?.content?.trim();
          if (fill) replyParts = mergeGroupParts(replyParts, parseGroupReply(fill, party), party);
        } catch {
          /* Keep the speakers we already have if the fill-in call fails. */
        }
      }
    }
    return Response.json({
      reply,
      replyParts,
      imageRequested: !blocksRejectedImage && imageIntent.shouldGenerate,
      voiceRequested: isVoiceRequest(latestUser),
      photoSpeakerId: photoSpeaker?.id || character.id,
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
