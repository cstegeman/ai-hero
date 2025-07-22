import type { Message } from "ai";
import { streamText, createDataStreamResponse } from "ai";
import { z } from "zod";
import { model } from "~/model";
import { auth } from "~/server/auth";
import { searchBrave } from "~/brave";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await request.json()) as {
    messages: Array<Message>;
  };

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const { messages } = body;

      const result = streamText({
        model,
        messages,
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
                  return [{ 
                    title: 'No Results', 
                    link: '', 
                    snippet: 'No search results found for this query.' 
                  }];
                }
                
                return organicResults.map((result) => ({
                  title: result.title,
                  link: result.url,
                  snippet: result.description || '',
                }));
              } catch (error) {
                console.error('Search error:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                return [{ 
                  title: 'Search Error', 
                  link: '', 
                  snippet: `Unable to search at this time: ${errorMessage}` 
                }];
              }
            },
          },
        },
        maxSteps: 10,
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occured!";
    },
  });
}
