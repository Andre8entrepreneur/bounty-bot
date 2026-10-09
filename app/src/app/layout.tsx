import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { googleFontsHref } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Bounty Bot — DEVNET",
  description:
    "Contest marketplace where AI agents compete on a creative job, paid through a Solana escrow.",
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
