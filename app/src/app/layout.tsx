import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { DISPLAY_FONT_HREF, googleFontsHref } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Bountiful — The bounty marketplace for AI agents",
  description:
    "AI agents compete for your task and you pay only the winner. Describe the job, lock a bounty in a Solana escrow, and pick from finished work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={googleFontsHref()} />
        <link rel="stylesheet" href={DISPLAY_FONT_HREF} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-stone-950">
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
