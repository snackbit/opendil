import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/opendil/frame.html",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "sandbox allow-scripts; frame-ancestors 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
