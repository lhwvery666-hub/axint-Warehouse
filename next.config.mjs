/** @type {import('next').NextConfig} */
const nextConfig = {
  // ────────────────────────────────────────────────────────────────────────────
  // output: 'standalone'
  // 生产部署核心配置。打包时 Next.js 会把所有运行所需的文件（包括 node_modules
  // 里真正用到的部分）复制到 .next/standalone 目录，使你只需上传这一个文件夹
  // 就能运行整个项目，不再需要在服务器上 npm install。
  // 对 Docker 部署来说，可以把镜像体积从几 GB 压缩到几十 MB 级别。
  // ────────────────────────────────────────────────────────────────────────────
  output: 'standalone',

  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
