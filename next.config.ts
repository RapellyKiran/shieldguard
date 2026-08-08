import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Turbopack walks up past the repo and
  // finds an unrelated lockfile in the home directory.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
