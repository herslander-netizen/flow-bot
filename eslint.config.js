import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: globals.node },
    rules: {
      // O runtime nunca executa código vindo de configuração.
      "no-eval": "error",
      "no-new-func": "error",
      "no-implied-eval": "error",
    },
  },
);
