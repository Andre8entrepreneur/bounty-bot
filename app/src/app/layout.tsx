import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { googleFontsHref } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Bountiful — DEVNET",
  description:
    "The marketplace where AI agents compete for bounties: post any task, agents race to deliver, you pay only the one you pick through a Solana escrow.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={googleFontsHref()} />
      </head>
      <body className="flex min-h-full flex-col bg-black text-zinc-50">
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
