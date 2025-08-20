import type { Message } from "ai";
import { createDataStreamResponse, appendResponseMessages } from "ai";
import { auth } from "~/server/auth";
import { streamFromDeepSearch } from "~/deep-search";
import { upsertChat } from "~/server/db/queries";
import { db } from "~/server/db";
import { eq } from "drizzle-orm";
import { chats } from "~/server/db/schema";
import { Langfuse } from "langfuse";
import { env } from "~/env";
import {
  checkRateLimit,
  recordRateLimit,
  type RateLimitConfig,
} from "~/rate-limit";

const langfuse = new Langfuse({
  environment: env.NODE_ENV,
});

export const maxDuration = 60;

// Rate limiting configuration
const rateLimitConfig: RateLimitConfig = {
  maxRequests: 1,
  maxRetries: 3,
  windowMs: 20_000, // 5 seconds for testing
  keyPrefix: "global",
};

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  // Check the rate limit
  const rateLimitCheck = await checkRateLimit(rateLimitConfig);

  if (!rateLimitCheck.allowed) {
    console.log("Rate limit exceeded, waiting...");
    const isAllowed = await rateLimitCheck.retry();
    // If the rate limit is still exceeded, return a 429
    if (!isAllowed) {
      return new Response("Rate limit exceeded", {
        status: 429,
      });
    }
  }

  // Record the request
  await recordRateLimit(rateLimitConfig);

  const body = (await request.json()) as {
    messages: Array<Message>;
    chatId: string;
    isNewChat: boolean;
  };

  const { messages, chatId, isNewChat } = body;

  if (!messages.length) {
    return new Response("No messages provided", {
      status: 400,
    });
  }

  // Create Langfuse trace early - we'll update the sessionId later
  const trace = langfuse.trace({
    name: "chat",
    userId: session.user.id,
  });

  // Handle chat creation and validation based on isNewChat flag
  const currentChatId = chatId;

  if (isNewChat) {
    // Create the chat with just the user's message
    const createChatSpan = trace.span({
      name: "create-new-chat",
      input: {
        userId: session.user.id,
        title: messages[messages.length - 1]!.content.slice(0, 50) + "...",
        messages,
      },
    });

    await upsertChat({
      userId: session.user.id,
      chatId: chatId,
      title: messages[messages.length - 1]!.content.slice(0, 50) + "...",
      messages: messages,
    });

    createChatSpan.end({
      output: {
        chatId: chatId,
      },
    });
  } else {
    // Check if the chat belongs to the user
    const validateChatSpan = trace.span({
      name: "validate-chat-ownership",
      input: {
        chatId: chatId,
        userId: session.user.id,
      },
    });

    const existingChat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });

    if (!existingChat || existingChat.userId !== session.user.id) {
      validateChatSpan.end({
        output: {
          chatExists: !!existingChat,
          chatUserId: existingChat?.userId,
        },
      });

      return new Response("Chat not found", {
        status: 404,
      });
    }

    validateChatSpan.end({
      output: {
        success: true,
        chatId: existingChat.id,
        chatTitle: existingChat.title,
      },
    });
  }

  // Update the trace with the sessionId now that we have the chatId
  trace.update({
    sessionId: currentChatId,
  });

  return createDataStreamResponse({
    execute: async (dataStream) => {
      // Send the new chat ID if we just created one
      if (isNewChat) {
        dataStream.writeData({
          type: "NEW_CHAT_CREATED",
          chatId: chatId,
        });
      }

      const result = streamFromDeepSearch({
        messages,
        onFinish: async ({ response }) => {
          const updatedMessages = appendResponseMessages({
            messages, // from the POST body
            responseMessages: response.messages,
          });

          const lastMessage = messages[messages.length - 1];
          if (!lastMessage) {
            return;
          }

          const updateChatSpan = trace.span({
            name: "update-chat",
            input: {
              userId: session.user.id,
              chatId: chatId,
              title: lastMessage.content.slice(0, 50) + "...",
              messageCount: updatedMessages.length,
            },
          });

          await upsertChat({
            userId: session.user.id,
            chatId: chatId,
            title: lastMessage.content.slice(0, 50) + "...",
            messages: updatedMessages,
          });

          updateChatSpan.end({
            output: {
              success: true,
              chatId: chatId,
              updatedMessageCount: updatedMessages.length,
            },
          });

          // Flush the trace to Langfuse
          await langfuse.flushAsync();
        },
        telemetry: {
          isEnabled: true,
          functionId: "agent",
          metadata: {
            langfuseTraceId: trace.id,
          },
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occured!";
    },
  });
}
