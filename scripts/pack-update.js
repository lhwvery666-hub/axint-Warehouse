/**
 * 打包部署更新包脚本
 * 用法：node scripts/pack-update.js
 * 
 * 执行后会在项目根目录生成 update-YYYYMMDD-HHmm.zip
 * 将这个 zip 文件发给公司同事，按照 DEPLOY.txt 里的步骤操作即可
 */

const fs   = require("fs")
const path = require("path")
const { execSync } = require("child_process")

const root    = path.resolve(__dirname, "..")
const outName = `update-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`
const outDir  = path.join(root, outName)
const zipFile = path.join(root, `${outName}.zip`)

// ── 1. 构建 ────────────────────────────────────────────────────────────────
console.log("📦 [1/4] 正在构建 Next.js standalone 产物...")
execSync("npm run build:prod", { cwd: root, stdio: "inherit" })
console.log("✅ 构建完成\n")

// ── 2. 收集需要部署的文件 ──────────────────────────────────────────────────
console.log("📂 [2/4] 收集部署文件...")
if (fs.existsSync(outDir)) throw new Error("更新输出目录已存在，请稍后重新打包")
fs.mkdirSync(outDir)

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    const relative = path.relative(root, s).split(path.sep).join("/")
    if (entry.name.startsWith(".env") || ["public/uploads", "uploads", ".next/standalone/public/uploads", ".next/standalone/uploads"].includes(relative)) continue
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

// standalone 目录（包含 server.js 和所有 node_modules）
copyDir(
  path.join(root, ".next", "standalone"),
  path.join(outDir, "standalone")
)

// static 文件（standalone 模式下需要单独复制）
copyDir(
  path.join(root, ".next", "static"),
  path.join(outDir, "standalone", ".next", "static")
)

// public 目录（图片、图标等静态资源）
copyDir(
  path.join(root, "public"),
  path.join(outDir, "standalone", "public")
)

// PM2 配置
fs.copyFileSync(
  path.join(root, "ecosystem.config.js"),
  path.join(outDir, "ecosystem.config.js")
)

// ── 3. 写入部署说明 ────────────────────────────────────────────────────────
console.log("📝 [3/4] 生成部署说明...")
const instructions = fs.readFileSync(path.join(root, "docs", "DEPLOY-1.0.txt"), "utf8")

fs.writeFileSync(path.join(outDir, "DEPLOY.txt"), instructions, "utf-8")
fs.mkdirSync(path.join(outDir, "scripts"), { recursive: true })
fs.copyFileSync(path.join(root, "scripts", "migrate-uploads.cjs"), path.join(outDir, "scripts", "migrate-uploads.cjs"))

// ── 4. 压缩打包 ────────────────────────────────────────────────────────────
console.log("🗜  [4/4] 压缩打包...")
try {
  // Windows 用 PowerShell，Linux/Mac 用 zip
  if (process.platform === "win32") {
    execSync(
      `powershell -Command "Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zipFile}' -Force"`,
      { stdio: "inherit" }
    )
  } else {
    execSync(`cd "${outDir}" && zip -r "${zipFile}" .`, { stdio: "inherit" })
  }
  fs.rmSync(outDir, { recursive: true }) // 清理临时目录
  console.log(`\n✅ 打包完成！`)
  console.log(`📦 文件位置：${zipFile}`)
  console.log(`\n👉 将此 zip 文件发给公司同事，按照压缩包内 DEPLOY.txt 操作即可。`)
} catch (e) {
  console.error("❌ 压缩失败（可能没有 zip 命令）。手动压缩以下目录：", outDir)
  console.log(`📂 临时目录已保留：${outDir}`)
}
