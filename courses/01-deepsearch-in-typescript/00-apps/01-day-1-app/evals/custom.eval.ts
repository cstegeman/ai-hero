import { evalite } from "evalite";
import { askDeepSearch } from "../src/deep-search";
import type { Message } from "ai";
import { Factuality } from "../src/factuality-scorer";
import { devData } from "./dev";
import { ciData } from "./ci";
import { regressionData } from "./regression";
import { env } from "../src/env";

// Select data based on environment variable
let data = devData;

// If CI, add the CI data
if (env.EVAL_DATASET === "ci") {
  data = [...data, ...ciData];
  // If Regression, add the regression data AND the CI data
} else if (env.EVAL_DATASET === "regression") {
  data = [...data, ...ciData, ...regressionData];
}

evalite("Custom Eval", {
  data: async (): Promise<{ input: Message[]; expected: string }[]> => {
    return data;
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
