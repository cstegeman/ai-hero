import { streamText, type Message, type TelemetrySettings } from "ai";
import { z } from "zod";
import { model } from "./model";
import { searchWeb, type SearchTool } from "./search";
import { bulkCrawlWebsites, type BulkCrawlResponse } from "./scraper";

export const streamFromDeepSearch = (opts: {
  messages: Message[];
  onFinish: Parameters<typeof streamText>[0]["onFinish"];
  telemetry: TelemetrySettings;
}) =>
  streamText({
    model,
    messages: opts.messages,
    maxSteps: 10,
    experimental_telemetry: opts.telemetry,
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
            const results = await searchWeb({ q: query, num: 10 }, abortSignal);

            // Handle the Serper Search API response structure (transformed to match Brave format)
            const organicResults = results.web?.results ?? [];

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
              snippet: result.description ?? "",
              date: result.date ?? "",
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
        execute: async ({ urls }, { abortSignal: _abortSignal }) => {
          const results = await bulkCrawlWebsites({ urls });

          if (!results.success) {
            return {
              error: (results as { error: string }).error,
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
    onFinish: opts.onFinish,
  });

export async function askDeepSearch(messages: Message[]) {
  const result = streamFromDeepSearch({
    messages,
    onFinish: () => {}, // just a stub
    telemetry: {
      isEnabled: false,
    },
  });

  // Consume the stream - without this,
  // the stream will never finish
  await result.consumeStream();

  return await result.text;
}
