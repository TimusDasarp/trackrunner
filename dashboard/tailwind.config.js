import { mtConfig } from "@material-tailwind/react";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./node_modules/@material-tailwind/react/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--content-primary)",
        panel: "var(--surface-app)",
        accent: "var(--color-brand)",
        surface: "var(--surface-raised)",
        "surface-variant": "var(--surface-muted)",
        "on-surface-variant": "var(--content-secondary)",
        border: "var(--border-subtle)",
        "brand-soft": "var(--color-brand-soft)",
        "status-success": "var(--status-success)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [mtConfig],
};
