import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Motema",
  description: "Rencontrez, aimez, connectez.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
