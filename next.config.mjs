import "./patch-node24.js";

// NEXT_OUTPUT=export builds a static site, which the Docker image serves next to the API
const exportStatic = process.env.NEXT_OUTPUT === "export";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(exportStatic ? { output: "export", trailingSlash: true } : {}),
};

export default nextConfig;
