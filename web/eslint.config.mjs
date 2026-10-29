import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  prettier,
  {
    files: ["app/workspace-app.tsx"],
    rules: {
      // Preserve original evidence and session-protected image URLs without optimization.
      "@next/next/no-img-element": "off",
    },
  },
]);
