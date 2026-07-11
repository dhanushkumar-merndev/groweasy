import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
