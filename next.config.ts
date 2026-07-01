import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 东方财富 API 需要允许图片和请求
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "push2.eastmoney.com" },
      { protocol: "https", hostname: "push2his.eastmoney.com" },
    ],
  },
};

export default nextConfig;
