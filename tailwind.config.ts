import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#08131f",
        panel: "#0e1a27",
        accent: "#1dd3b0",
        accentSoft: "#102d29",
      },
      boxShadow: {
        soft: "0 20px 50px rgba(0, 0, 0, 0.28)",
      },
    },
  },
  plugins: [],
};

export default config;
