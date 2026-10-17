import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProviders } from "@/components/providers";

export const metadata: Metadata = {
  title: "UZON — Created in Uzbekistan. Connected to the world.",
  description:
    "UZON is a social platform combining a messenger, stories, vertical clips, long-form video and a creator studio.",
  applicationName: "UZON",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#10121B" },
    { media: "(prefers-color-scheme: light)", color: "#F4F5FA" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
