import type { Metadata } from "next";
import { ChatListScreen } from "@/components/ChatListScreen";

export const metadata: Metadata = { title: "チャット — Chatkari" };

export default function ChatsPage() {
  return <ChatListScreen />;
}
