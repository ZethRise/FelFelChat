import type { NextConfig } from "next";
import os from "os";

function lanDevOrigins(): string[] {
  const hosts = new Set<string>();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        hosts.add(addr.address);
      }
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  // Next.js 15+ blocks /_next assets from non-localhost hosts in dev.
  // Allow LAN IPs so phones can load JS over Wi-Fi.
  allowedDevOrigins: lanDevOrigins(),
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
