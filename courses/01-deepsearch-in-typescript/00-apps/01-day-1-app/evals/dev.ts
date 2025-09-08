import type { Message } from "ai";

export const devData: { input: Message[]; expected: string }[] = [
  // Simple questions - toughest cases for local testing
  {
    input: [
      {
        id: "1",
        role: "user",
        content: "What is the most recent release of home assistant?",
      },
    ],
    expected: "The most recent version of home assistant is 2025.9.1",
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
];
