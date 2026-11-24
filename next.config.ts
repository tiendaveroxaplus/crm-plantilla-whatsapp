import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Las fotos de productos las descarga WhatsApp: cabeceras de caché para que se sirvan rápido.
  async headers() {
    const cache = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];
    return [{ source: "/products/:path*", headers: cache }, { source: "/brand/:path*", headers: cache }];
  },
};

export default nextConfig;
