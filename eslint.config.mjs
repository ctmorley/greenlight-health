import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      ".next/**",
      ".claude/**",
      "node_modules/**",
      "public/**",
      "*.js",
      "*.cjs",
      "scripts/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@next/next": nextPlugin,
    },
    languageOptions: {
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        FormData: "readonly",
        File: "readonly",
        Blob: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLButtonElement: "readonly",
        KeyboardEvent: "readonly",
        Map: "readonly",
        // Node globals
        process: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      // TypeScript rules
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/triple-slash-reference": "off",
      // Next.js recommended rules
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // Override some Next.js rules
      "@next/next/no-html-link-for-pages": "warn",
      "@next/next/no-img-element": "warn",
      // no-page-custom-font is a Pages Router rule; not applicable in App Router
      "@next/next/no-page-custom-font": "off",
    },
  },
];
