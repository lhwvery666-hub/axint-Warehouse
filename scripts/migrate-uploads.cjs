const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

// Copies only; never deletes the old release or overwrites a different attachment.
function migrateUploads(source, target, copy = false) {
  const from = fs.realpathSync(source)
  const to = path.resolve(target)
  const relative = path.relative(from, to)
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("目标目录不能是源目录或其子目录")
  }
  let files = 0
  let copied = 0
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const input = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`不跟随符号链接：${input}`)
      if (entry.isDirectory()) { visit(input); continue }
      if (!entry.isFile()) continue
      const output = path.resolve(to, path.relative(from, input))
      const within = path.relative(to, output)
      if (!within || within === ".." || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) {
        throw new Error("目标路径越界")
      }
      files++
      if (fs.existsSync(output)) {
        if (!fs.statSync(output).isFile() || digest(input) !== digest(output)) {
          throw new Error(`存在不同内容的同名文件，未覆盖：${output}`)
        }
        continue
      }
      if (copy) {
        fs.mkdirSync(path.dirname(output), { recursive: true })
        fs.copyFileSync(input, output, fs.constants.COPYFILE_EXCL)
        if (digest(input) !== digest(output)) throw new Error(`复制后校验失败：${output}`)
        copied++
      }
    }
  }
  visit(from)
  return { source: from, target: to, mode: copy ? "copy" : "dry-run", files, copied }
}

if (require.main === module) {
  const [source, target, flag] = process.argv.slice(2)
  if (!source || !target || (flag && flag !== "--copy")) {
    console.error("用法：node scripts/migrate-uploads.cjs <旧附件目录> <独立持久目录> [--copy]")
    process.exitCode = 1
  } else {
    try { console.log(JSON.stringify(migrateUploads(source, target, flag === "--copy"), null, 2)) }
    catch (error) { console.error(error.message); process.exitCode = 1 }
  }
}
module.exports = { migrateUploads }
