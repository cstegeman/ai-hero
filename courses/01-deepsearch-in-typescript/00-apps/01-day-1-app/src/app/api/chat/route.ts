import type { Message } from "ai";
import {
  streamText,
  createDataStreamResponse,
  appendResponseMessages,
} from "ai";
import { z } from "zod";
import { model } from "~/model";
import { auth } from "~/server/auth";
import { searchBrave } from "~/brave";
import { upsertChat } from "~/server/db/queries";
import { db } from "~/server/db";
import { eq } from "drizzle-orm";
import { chats } from "~/server/db/schema";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  const body = (await request.json()) as {
    messages: Array<Message>;
    chatId?: string;
  };

  const { messages, chatId } = body;

  if (!messages.length) {
    return new Response("No messages provided", {
      status: 400,
    });
  }

  // Create a new chat if chatId is not provided
  let currentChatId = chatId;
  if (!currentChatId) {
    currentChatId = crypto.randomUUID();

    // Create the chat with just the user's message
    await upsertChat({
      userId: session.user.id,
      chatId: currentChatId,
      title: messages[messages.length - 1]!.content.slice(0, 50) + "...",
      messages: messages,
    });
  } else {
    // Check if the chat belongs to the user
    const existingChat = await db.query.chats.findFirst({
      where: eq(chats.id, currentChatId),
    });

    if (!existingChat || existingChat.userId !== session.user.id) {
      return new Response("Chat not found", {
        status: 404,
      });
    }
  }

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const result = streamText({
        model,
        messages,
        maxSteps: 10,
        system: `You are a helpful AI assistant with access to web search capabilities. 
        
When answering questions, you should:
1. Always attempt to search the web for current, relevant information to provide accurate and up-to-date answers
2. Use the search tool to find information before responding
3. Cite your sources with inline links in your responses
4. If you find relevant information, incorporate it into your answer with proper attribution
5. Provide comprehensive answers that combine search results with your knowledge

Always strive to give the most current and accurate information possible by leveraging web search.`,
        tools: {
          searchWeb: {
            description: "Search the web for current information",
            parameters: z.object({
              query: z.string().describe("The query to search the web for"),
            }),
            execute: async ({ query }, { abortSignal }) => {
              try {
                const results = await searchBrave(
                  { q: query, num: 10 },
                  abortSignal,
                );

                // Handle the actual Brave Search API response structure
                const organicResults = results.web?.results || [];

                if (organicResults.length === 0) {
                  return [
                    {
                      title: "No Results",
                      link: "",
                      snippet: "No search results found for this query.",
                    },
                  ];
                }

                return organicResults.map((result) => ({
                  title: result.title,
                  link: result.url,
                  snippet: result.description || "",
                }));
              } catch (error) {
                console.error("Search error:", error);
                const errorMessage =
                  error instanceof Error ? error.message : "Unknown error";
                return [
                  {
                    title: "Search Error",
                    link: "",
                    snippet: `Unable to search at this time: ${errorMessage}`,
                  },
                ];
              }
            },
          },
        },
        onFinish: ({ text, finishReason, usage, response }) => {
          const updatedMessages = appendResponseMessages({
            messages, // from the POST body
            responseMessages: response.messages,
          });

          const lastMessage = messages[messages.length - 1];
          if (!lastMessage) {
            return;
          }

          upsertChat({
            userId: session.user.id,
            chatId: currentChatId!,
            title: lastMessage.content.slice(0, 50) + "...",
            messages: updatedMessages,
          });
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
