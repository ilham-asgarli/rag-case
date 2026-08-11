import type { Metadata } from "next";
import { ChatView } from "@/features/chat/chat-view";
import { requireSession } from "@/server/guards";

export const metadata: Metadata = { title: "Chat · Lumen Corpus" };

export default async function ChatPage() {
  await requireSession();
  return <ChatView />;
}
