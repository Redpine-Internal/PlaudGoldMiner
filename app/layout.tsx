import type { Metadata } from "next";
import AppShell from "@/components/layout/AppShell";
import { SessionProvider } from "@/components/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plaud Gold Miner",
  description: "Gestão de conversas e insights.",
};

// Applied before hydration to avoid a flash of the wrong color scheme.
// 'pgm-theme': 'dark' | 'light'; unset follows the system preference.
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('pgm-theme');if(t==='dark'||(t!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
