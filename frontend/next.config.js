/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // 纯静态导出 — API 代理由 nginx 处理
  // 不在构建时绑定 API 地址，运行时 nginx 反向代理到 localhost:8000
  trailingSlash: true,
};

module.exports = nextConfig;
