import { evalite } from "evalite";
import { askDeepSearch } from "../src/deep-search";
import type { Message } from "ai";
import { Factuality } from "../src/factuality-scorer";

evalite("Custom Eval", {
  data: async (): Promise<{ input: Message[]; expected: string }[]> => {
    return [
      // Simple questions
      {
        input: [
          {
            id: "1",
            role: "user",
            content: "What is the most recent release of home assistant?",
          },
        ],
        expected: "The most recent version of home assistant is 2025.8",
      },
      {
        input: [
          {
            id: "2",
            role: "user",
            content: "What device did home assistant launch in August 2025?",
          },
        ],
        expected: "Home Assistant Connect ZWA-2",
      },
      {
        input: [
          {
            id: "3",
            role: "user",
            content:
              "What is the main reason smart home enhusiasts go for Home Assistant?",
          },
        ],
        expected:
          "Home Assistant is a popular choice for smart home enthusiasts because it is open source, runs fully local and is customizable.",
      },
      // Complex questions
      {
        input: [
          {
            id: "4",
            role: "user",
            content: `Does running "pnpm update --interactive --latest" also try to update dependencies in my app folder? It's included in the pnpm-workspace.yaml file`,
          },
        ],
        expected:
          "No it does not, you need to add the -r flag to update dependencies other than the root level.",
      },
      {
        input: [
          {
            id: "5",
            role: "user",
            content:
              "How can I properly setup commit hooks in my monorepo using pnpm and turborepo?",
          },
        ],
        expected:
          "Use husky for commit hooks, lint-staged for checking which files are changed  and use turborepo for running commands in the monorepo.",
      },
      {
        input: [
          {
            id: "6",
            role: "user",
            content: "How do you do a 404 page in TanStack Start?",
          },
        ],
        expected:
          "notFound Function and notFoundComponent API: This is the newer, recommended way to handle 'not found' errors in TanStack Router.",
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
    Factuality,
  ],
});
