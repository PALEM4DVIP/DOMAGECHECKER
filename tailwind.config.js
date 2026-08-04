/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0F14",
        panel: "#101823",
        panel2: "#0D141C",
        line: "#1E2A38",
        signal: "#4FD8C4",
        signal2: "#F2B84B",
        danger: "#E8604C",
        muted: "#7C8A9A",
        paper: "#E7EDF3",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["'Inter'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(79,216,196,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(79,216,196,0.05) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "28px 28px",
      },
    },
  },
  plugins: [],
};
