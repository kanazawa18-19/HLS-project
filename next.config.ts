import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3はネイティブモジュールのため、Next.jsのバンドル対象から除外してrequireさせる
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
