import type { MetadataRoute } from "next";

// Manifesto PWA: permite instalar o app na tela de início (iOS/Android) e
// abri-lo em janela própria, sem a barra do navegador.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plaud Gold Miner",
    short_name: "Gold Miner",
    description: "Gestão de conversas e insights.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Canvas e tinta canônicos do Intelligence OS (styles/intelligence-os.css).
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
