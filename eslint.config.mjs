import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...next,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**"],
  },
  {
    rules: {
      // Our client hooks (useProvider, weather page) intentionally fetch from
      // external sources inside an effect and sync the result into state — a
      // legitimate "subscribe to an external system" use that the React docs
      // permit. Keep it as a warning rather than a hard error.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
