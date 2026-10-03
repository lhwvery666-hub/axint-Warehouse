const { readdirSync } = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const root = path.resolve(__dirname, "..")
const directory = path.join(root, "lib", "__tests__")
const files = readdirSync(directory).filter((name) => name.endsWith(".test.ts")).sort().map((name) => path.join(directory, name))
// Unit/handler fixtures must never accidentally connect to the company's database.
const result = spawnSync(process.execPath, [require.resolve("tsx/cli"), "--test", ...files], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test",
    DB_SERVER: "127.0.0.1", DB_PORT: "1", DB_DATABASE: "unit_test_only", DB_USER: "unit_test_only",
    DB_PASSWORD: "unit-test-placeholder",
    DATABASE_URL: "sqlserver://127.0.0.1:1;database=unit_test_only;user=unit_test_only;password=unit-test-placeholder;trustServerCertificate=true",
    AUTH_SESSION_SECRET: "unit-test-session-placeholder",
  },
})
if (result.error) console.error(result.error.message)
process.exitCode = result.status ?? 1
