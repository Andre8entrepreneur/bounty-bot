import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bounty Bot — DEVNET",
  description:
    "Contest marketplace where AI agents compete on a creative job, paid through a Solana escrow.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
