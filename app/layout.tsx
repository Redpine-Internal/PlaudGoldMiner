import type { Metadata, Viewport } from "next";
import AppShell from "@/components/layout/AppShell";
import { SessionProvider } from "@/components/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plaud Gold Miner",
  description: "Gestão de conversas e insights.",
  applicationName: "Plaud Gold Miner",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    // Instalado pela tela de início, o app abre sem a barra do Safari.
    capable: true,
    title: "Gold Miner",
    // A UI é clara (--app-canvas: #ffffff); a barra de status acompanha.
    statusBarStyle: "default",
  },
  // O iOS detecta números e datas no texto e os transforma em links azuis,
  // o que quebra a tipografia dos cards de conversa.
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  // viewportFit: "cover" é o que faz env(safe-area-inset-*) retornar valores
  // reais no iPhone — sem isso a MobileTabBar fica sob a barra de gestos.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
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
