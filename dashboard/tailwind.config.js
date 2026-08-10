import { mtConfig } from "@material-tailwind/react";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./node_modules/@material-tailwind/react/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1b1b1f",
        panel: "#f8f7ff",
        accent: "#405f90",
        surface: "#fdfbff",
        "surface-variant": "#e0e2ec",
        "on-surface-variant": "#43474e",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [mtConfig],
};
