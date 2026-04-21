/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        pitch: {
          50:  "#ecfdf5",
          100: "#d1fae5",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          900: "#064e3b",
        },
        ink: {
          50:  "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          400: "#94a3b8",
          500: "#64748b",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
        accent: {
          500: "#8b5cf6",
          600: "#7c3aed",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.04), 0 4px 20px rgba(15,23,42,.06)",
        pop:  "0 10px 40px rgba(15,23,42,.12)",
      },
      backgroundImage: {
        "grid-soft":
          "linear-gradient(rgba(148,163,184,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.08) 1px, transparent 1px)",
        "pitch-hero":
          "radial-gradient(1200px 400px at 10% -10%, rgba(16,185,129,.22), transparent 60%), radial-gradient(1200px 400px at 100% 0%, rgba(139,92,246,.18), transparent 60%)",
      },
    },
  },
  plugins: [],
};
