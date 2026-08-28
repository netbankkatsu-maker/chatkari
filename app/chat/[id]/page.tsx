import { ChatRoom } from "@/components/ChatRoom";
import { getCharacter } from "@/data/characters";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const character = getCharacter(id);
  return <ChatRoom characterId={id} staticCharacter={character} />;
}
