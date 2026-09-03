import type { Metadata } from "next";
import AppShell from "@/components/layout/AppShell";
import { SessionProvider } from "@/components/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plaud Gold Miner",
  description: "Gestão de conversas e insights.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
