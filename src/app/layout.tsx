import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Recheck",
  description: "Verify surveyors and survey plans before you pay for land.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-background text-foreground">
        <Providers>
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
          <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted">
            <a href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </a>
            <span className="mx-2">·</span>
            <span>© {new Date().getFullYear()} Recheck</span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
