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
import { bulkCrawlWebsites, type CrawlErrorResponse } from "~/scraper";
import { upsertChat } from "~/server/db/queries";
import { db } from "~/server/db";
import { eq } from "drizzle-orm";
import { chats } from "~/server/db/schema";
import { Langfuse } from "langfuse";
import { env } from "~/env";

const langfuse = new Langfuse({
  environment: env.NODE_ENV,
});

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

      const result = streamText({
        model,
        messages,
        maxSteps: 10,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "agent",
          metadata: {
            langfuseTraceId: trace.id,
          },
        },
        system: `You are a helpful AI assistant with access to web search and web scraping capabilities. 

CURRENT DATE AND TIME: ${new Date().toISOString()}

When answering questions:

1. Always search the web for up-to-date information when relevant
2. ALWAYS format URLs as markdown links using the format [title](url)
3. Be thorough but concise in your responses
4. If you're unsure about something, search the web to verify
5. When providing information, always include the source where you found it using markdown links
6. Never include raw URLs - always use markdown link format
7. When users ask for up-to-date information, use the current date (${new Date().toISOString()}) to provide context and help determine if information is recent
8. IMPORTANT: After finding relevant URLs from search results, ALWAYS use the scrapePages tool 
to get the full content of those pages. Never rely solely on search snippets.

Your workflow should be:
1. Use searchWeb to find 10 relevant URLs from diverse sources (news sites, blogs, official documentation, etc.)
2. Select 4-6 of the most relevant and diverse URLs to scrape
3. Use scrapePages to get the full content of those URLs
4. Use the full content to provide detailed, accurate answers

Remember to:
- Always scrape multiple sources (4-6 URLs) for each query
- Choose diverse sources (e.g., not just news sites or just blogs)
- Prioritize official sources and authoritative websites
- Use the full content to provide comprehensive answers
- When users ask for current information (weather, sports scores, news, etc.), emphasize that you have access to the current date and can help determine if information is up-to-date
- Pay attention to the date field in search results to determine how recent the information is

Remember to use both tools in combination - searchWeb to find relevant pages, and scrapePages to get their full content from diverse sources.`,
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

                // Handle the Brave Search API response structure
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
                  date: result.date || "",
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
          scrapePages: {
            parameters: z.object({
              urls: z.array(z.string()).describe("The URLs to scrape"),
            }),
            execute: async ({ urls }, { abortSignal }) => {
              const results = await bulkCrawlWebsites({ urls });

              if (!results.success) {
                return {
                  error: results.error,
                  results: results.results.map(({ url, result }) => ({
                    url,
                    success: result.success,
                    data: result.success ? result.data : result.error,
                  })),
                };
              }

              return {
                results: results.results.map(({ url, result }) => ({
                  url,
                  success: result.success,
                  data: result.data,
                })),
              };
            },
          },
        },
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
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occured!";
    },
  });
}
