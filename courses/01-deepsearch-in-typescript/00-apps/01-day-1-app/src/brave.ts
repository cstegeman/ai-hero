import { cacheWithRedis } from "~/server/redis/redis";
import { env } from "~/env.js";

export declare namespace BraveTool {
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

const fetchFromBrave = cacheWithRedis(
  "brave",
  async (
    url: string,
    options: Omit<RequestInit, "headers"> & { signal: AbortSignal | undefined },
  ): Promise<BraveTool.SearchResult> => {
    if (!env.BRAVE_SEARCH_API_KEY) {
      throw new Error("BRAVE_SEARCH_API_KEY is not set in .env");
    }

    const response = await fetch(`https://api.search.brave.com${url}`, {
      ...options,
      headers: {
        "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY,
        Accept: "application/json",
        "Accept-Encoding": "gzip",
      },
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "Brave API error:",
        response.status,
        response.statusText,
        errorText,
      );
      throw new Error(
        `Brave API error: ${response.status} ${response.statusText}`,
      );
    }

    const json = await response.json();
    return json;
  },
);

export const searchBrave = async (
  body: BraveTool.SearchInput,
  signal: AbortSignal | undefined,
) => {
  const { q, num } = body;

  // Use the correct endpoint path for Brave Search API
  const searchParams = new URLSearchParams({
    q,
    count: num.toString(),
  });

  const results = await fetchFromBrave(`/res/v1/web/search?${searchParams}`, {
    method: "GET",
    signal,
  });

  return results;
};
