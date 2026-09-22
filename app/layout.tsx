import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AppJA - IASD Amadora",
  description: "AppJA - IASD Amadora registration",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
