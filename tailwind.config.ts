import type { Config } from "tailwindcss";

/**
 * Motema design tokens — source of truth: motema-charte-a/b.png (v1.0 · 2026).
 * Règle 60/30/10 : blanc (fonds) / charbon (texte) / rose (accents).
 * Grille 8 px : retraits 24, groupes 16, éléments 8.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#E02556", // Rose CTA — texte blanc conforme WCAG AA (4,6:1)
          hover: "#C21D47", // Survol CTA
          fg: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#FF4B72", // Rose vif — cœurs, notifications, logo
          hover: "#E13A60", // Survol assombri (pattern charte, jamais l'opacité)
        },
        ink: "#111111", // Charbon — texte, titres, icônes
        disabled: "#F3F3F4", // Boutons désactivés
        // Hors charte v1.0 (proposé v1.1) : rouge sémantique d'erreur, AA à 13px,
        // distinct du rose CTA pour ne pas ressembler à un lien. En fond :
        // bouton DESTRUCTIF (confirmations irréversibles) uniquement.
        error: {
          DEFAULT: "#B3261E",
          hover: "#8F1E18",
        },
      },
      borderRadius: {
        card: "1rem",
        btn: "0.625rem",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-poppins)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Échelle typographique de la charte
        h1: ["3rem", { lineHeight: "3.5rem", fontWeight: "700" }], // 48/56 Poppins Bold
        h2: ["2rem", { lineHeight: "2.5rem", fontWeight: "700" }], // 32/40 Poppins Bold
        h3: ["1.5rem", { lineHeight: "2rem", fontWeight: "600" }], // 24/32 Poppins SemiBold
        body: ["1rem", { lineHeight: "1.625rem" }], // 16/26 Inter Regular
        legend: ["0.8125rem", { lineHeight: "1.125rem", fontWeight: "500" }], // 13/18 Inter Medium
      },
    },
  },
  plugins: [],
};

export default config;
