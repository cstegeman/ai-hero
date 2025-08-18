import { cacheWithRedis } from "~/server/redis/redis";
import { env } from "~/env.js";

export declare namespace SearchTool {
  export type SearchInput = {
    q: string;
    num: number;
  };

  export interface OrganicResult {
    title: string;
    url: string;
    description: string;
    date?: string;
  }

  export interface SearchResult {
    web?: {
      results: OrganicResult[];
    };
  }
}

interface SerperResponse {
  organic?: Array<{
    title: string;
    link: string;
    snippet: string;
    date?: string;
  }>;
}

const fetchFromSerper = cacheWithRedis(
  "serper",
  async (
    url: string,
    options: Omit<RequestInit, "headers"> & { signal: AbortSignal | undefined },
  ): Promise<SerperResponse> => {
    if (!env.SERPER_SEARCH_API_KEY) {
      throw new Error("SERPER_SEARCH_API_KEY is not set in .env");
    }

    const response = await fetch(`https://google.serper.dev${url}`, {
      ...options,
      headers: {
        "X-API-KEY": env.SERPER_SEARCH_API_KEY,
        "Content-Type": "application/json",
      },
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "Serper API error:",
        response.status,
        response.statusText,
        errorText,
      );
      throw new Error(
        `Serper API error: ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as SerperResponse;
    return json;
  },
);

export const searchWeb = async (
  body: SearchTool.SearchInput,
  signal: AbortSignal | undefined,
): Promise<SearchTool.SearchResult> => {
  const { q, num } = body;

  // Use serper API with the same interface as brave
  const results = await fetchFromSerper(`/search`, {
    method: "POST",
    body: JSON.stringify({
      q,
      num,
      type: "search",
      engine: "google",
    }),
    signal,
  });

  // Transform serper response to match brave response format
  const transformedResults: SearchTool.SearchResult = {
    web: {
      results:
        results.organic?.map((result) => ({
          title: result.title,
          url: result.link,
          description: result.snippet,
          date: result.date,
        })) ?? [],
    },
  };

  return transformedResults;
};
