import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera um servidor Node autocontido em .next/standalone para a imagem Docker do Cloud Run.
  output: "standalone",
  // Só vale em `next dev`: sem isto o Next bloqueia /_next/hmr quando a página é
  // aberta por 127.0.0.1, o React não hidrata e formulários caem no envio nativo.
  // No login isso mandava a senha na query string via GET.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
