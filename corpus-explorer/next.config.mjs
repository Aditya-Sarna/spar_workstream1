/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native addon. Vercel compiles it for Linux at install; Next must not bundle it.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
