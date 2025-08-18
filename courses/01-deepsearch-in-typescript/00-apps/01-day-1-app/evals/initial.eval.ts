import { evalite } from "evalite";
import { askDeepSearch } from "../src/deep-search";
import type { Message } from "ai";

evalite("Deep Search Eval", {
  data: async (): Promise<{ input: Message[] }[]> => {
    return [
      {
        input: [
          {
            id: "1",
            role: "user",
            content: "What is the latest version of TypeScript?",
          },
        ],
      },
      {
        input: [
          {
            id: "2",
            role: "user",
            content: "What are the main features of Next.js 15?",
          },
        ],
      },
      {
        input: [
          {
            id: "3",
            role: "user",
            content:
              "Compare React and Vue.js for building modern web applications",
          },
        ],
      },
      {
        input: [
          {
            id: "4",
            role: "user",
            content:
              "Best practices for handling authentication in Next.js applications",
          },
        ],
      },
      {
        input: [
          {
            id: "5",
            role: "user",
            content: "Explain the differences between REST and GraphQL APIs",
          },
        ],
      },
      {
        input: [
          {
            id: "6",
            role: "user",
            content:
              "What are the key features of Tailwind CSS and how does it compare to other libraries",
          },
        ],
      },
    ];
  },
  task: async (input) => {
    return askDeepSearch(input);
  },
  scorers: [
    {
      name: "Contains Links",
      description: "Checks if the output contains any markdown links.",
      scorer: ({ output }) => {
        const regex = /\[[^\]]+\]\([^)]+\)/;
        const containsLinks = regex.test(output);

        return containsLinks ? 1 : 0;
      },
    },
  ],
});
