import { db } from "./index";
import { chats, messages } from "./schema";
import { eq, and } from "drizzle-orm";
import type { Message as AiMessage } from "ai";

export const upsertChat = async (opts: {
  userId: string;
  chatId: string;
  title: string;
  messages: AiMessage[];
}) => {
  // Check if chat exists
  const chat = await db.query.chats.findFirst({
    where: eq(chats.id, opts.chatId),
  });

  if (chat) {
    if (chat.userId !== opts.userId) {
      throw new Error("Chat not found");
    }
    // Delete all messages for this chat
    await db.delete(messages).where(eq(messages.chatId, opts.chatId));
  } else {
    // Create new chat
    await db.insert(chats).values({
      id: opts.chatId,
      title: opts.title,
      userId: opts.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Insert all messages
  if (opts.messages.length > 0) {
    await db.insert(messages).values(
      opts.messages.map((msg, i) => ({
        id: `${opts.chatId}-${i}`,
        chatId: opts.chatId,
        order: i + 1,
        role: msg.role,
        parts: msg.parts,
        createdAt: new Date(),
      })),
    );
  }
};

export const getChat = async (opts: { userId: string; chatId: string }) => {
  // Get chat and its messages (ordered)
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, opts.chatId), eq(chats.userId, opts.userId)),
    with: {
      messages: {
        orderBy: (messages, { asc }) => [asc(messages.order)],
      },
    },
  });
  return chat;
};

export const getChats = async (opts: { userId: string }) => {
  // Get all chats for user, no messages
  return db.query.chats.findMany({
    where: eq(chats.userId, opts.userId),
    columns: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: (chats, { desc }) => [desc(chats.updatedAt)],
  });
};
