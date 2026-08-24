import type { Metadata } from "next";
import AppShell from "@/components/layout/AppShell";
import { SessionProvider } from "@/components/auth";
import ThemeBoot from "@/components/theme/ThemeBoot";
import "./globals.css";

export const metadata: Metadata = {
  title: "Andreza AI",
  description: "Gestão de conversas e insights.",
};

// Applied before hydration to avoid a flash of default theme.
const THEME_BOOT = `(function(){try{var r=document.documentElement.style;var a=localStorage.getItem('andresa-theme-accent');if(a){var mix=a==='#000000'?'white':'black';r.setProperty('--brand',a);r.setProperty('--brandHigh',a);r.setProperty('--buttonPrimaryBackground',a);r.setProperty('--buttonPrimaryBackgroundHover','color-mix(in srgb, '+a+' 85%, '+mix+')');r.setProperty('--buttonPrimaryBackgroundPressed','color-mix(in srgb, '+a+' 70%, black)');r.setProperty('--textLink',a);r.setProperty('--textActivated',a);r.setProperty('--controlActivated',a);r.setProperty('--borderSelected',a);r.setProperty('--textButtonSecondary',a);r.setProperty('--textButtonSecondaryPressed',a);}var presets={quente:{success:'#7D9B76',warning:'#D4A03C',error:'#C25E4C',promo:'#C77D4F',active:'#A9825A',inactive:'#A79E93'},vivas:{success:'#1F9E64',warning:'#E0A526',error:'#DC4437',promo:'#A855F7',active:'#0FA3B1',inactive:'#8A94A6'},pastel:{success:'#8FC7BD',warning:'#DBBE7F',error:'#E89890',promo:'#CBA3E8',active:'#93C5DD',inactive:'#B8C0CC'}};var x=localStorage.getItem('andresa-theme-aux');if(x&&presets[x]){var p=presets[x];['success','warning','error','promo','active','inactive'].forEach(function(k){r.setProperty('--accent-'+k,p[k]);});}var b=localStorage.getItem('andresa-theme-bg');if(b){r.setProperty('--background',b);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <ThemeBoot />
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
