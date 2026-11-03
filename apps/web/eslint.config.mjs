import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  prettier,
  {
    files: [
      "src/features/conversations/conversations.tsx",
      "src/features/orders/business-lists.tsx",
      "src/features/orders/draft-editor.tsx",
      "src/features/orders/pack-check.tsx",
    ],
    rules: {
      // Preserve original evidence and session-protected image URLs without optimization.
      "@next/next/no-img-element": "off",
    },
  },
]);
