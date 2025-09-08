import type { Message } from "ai";

export const regressionData: { input: Message[]; expected: string }[] = [
  // Complex questions for regression testing
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
