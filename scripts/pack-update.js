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
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true })
fs.mkdirSync(outDir)

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
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
const instructions = `
=======================================================
  Axiom 维修系统 - 更新部署说明
  打包时间：${new Date().toLocaleString("zh-CN")}
=======================================================

【前提条件】
  服务器上已安装 Node.js 18+ 和 PM2。
  系统当前正在运行（pm2 list 可以看到 axiom-repair）。

【更新步骤】（在服务器上执行）

  第一步：备份当前版本（可选但建议）
    cp -r /你的部署路径 /你的部署路径.bak.$(date +%Y%m%d)

  第二步：将本压缩包上传到服务器并解压
    unzip ${outName}.zip -d /tmp/${outName}

  第三步：替换 standalone 目录
    # 停止服务（会有几秒中断）
    pm2 stop axiom-repair
    
    # 替换文件
    rm -rf /你的部署路径/.next/standalone
    cp -r /tmp/${outName}/standalone /你的部署路径/.next/standalone
    
    # 如果 ecosystem.config.js 也有更新，一并替换：
    cp /tmp/${outName}/ecosystem.config.js /你的部署路径/ecosystem.config.js

  第四步：重启服务
    pm2 start /你的部署路径/ecosystem.config.js --env production
    # 或者如果进程已存在：
    pm2 restart axiom-repair

  第五步：验证
    pm2 list          ← 确认状态是 online
    pm2 logs axiom-repair --lines 20   ← 查看启动日志有无报错

【遇到问题】
  如果启动失败，立刻回滚：
    pm2 stop axiom-repair
    rm -rf /你的部署路径/.next/standalone
    cp -r /你的部署路径.bak.xxxx/.next/standalone /你的部署路径/.next/standalone
    pm2 start /你的部署路径/ecosystem.config.js --env production

=======================================================
`.trim()

fs.writeFileSync(path.join(outDir, "DEPLOY.txt"), instructions, "utf-8")

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
