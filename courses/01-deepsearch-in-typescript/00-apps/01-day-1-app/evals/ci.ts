import type { Message } from "ai";

export const ciData: { input: Message[]; expected: string }[] = [
  // Additional test cases for CI pre-deployment testing
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
];
