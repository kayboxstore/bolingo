import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { SplashScreen } from "@/components/splash-screen";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Bolingo",
    template: "%s · Bolingo",
  },
  description: "Là où les cœurs se rencontrent.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${inter.variable} ${poppins.variable}`}>
      <body>
        {children}
        {/* Overlay fixe (z-9999), affiché une seule fois par session, monté
            client uniquement — s'auto-neutralise côté serveur (mounted gate). */}
        <SplashScreen />
      </body>
    </html>
  );
}
