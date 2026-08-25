import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera um servidor Node autocontido em .next/standalone para a imagem Docker do Cloud Run.
  output: "standalone",
};

export default nextConfig;
