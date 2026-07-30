import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const API_ROOT = path.join(process.cwd(), "app", "api")
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"])
const AUTH_CALLS = new Set(["checkUserRole", "getCurrentUserRole"])
const PUBLIC_AUTH_HANDLERS = new Set([
  "auth/login/route.ts#POST",
  "auth/logout/route.ts#POST",
  "auth/me/route.ts#GET",
  "auth/register/route.ts#POST",
])

async function findRouteFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        return findRouteFiles(absolutePath)
      }
      return entry.isFile() && entry.name === "route.ts" ? [absolutePath] : []
    })
  )

  return nestedFiles.flat()
}

function containsAuthCall(node: ts.Node): boolean {
  let found = false

  function visit(child: ts.Node): void {
    if (found) return

    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      AUTH_CALLS.has(child.expression.text)
    ) {
      found = true
      return
    }

    ts.forEachChild(child, visit)
  }

  visit(node)
  return found
}

async function auditRoute(filePath: string): Promise<string[]> {
  const sourceText = await readFile(filePath, "utf8")
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const relativePath = path.relative(API_ROOT, filePath).replaceAll("\\", "/")
  const failures: string[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) {
      continue
    }

    const method = statement.name.text
    if (!HTTP_METHODS.has(method)) {
      continue
    }

    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    )
    if (!isExported) {
      continue
    }

    const handlerKey = `${relativePath}#${method}`
    if (!PUBLIC_AUTH_HANDLERS.has(handlerKey) && !containsAuthCall(statement.body)) {
      failures.push(handlerKey)
    }
  }

  return failures
}

async function main(): Promise<void> {
  const routeFiles = await findRouteFiles(API_ROOT)
  const auditResults = await Promise.all(routeFiles.map(auditRoute))
  const failures = auditResults.flat().sort()

  if (failures.length > 0) {
    console.error("API handlers missing standardized authentication:")
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exitCode = 1
    return
  }

  console.log(`API authentication audit passed (${routeFiles.length} route files).`)
}

void main().catch((error: unknown) => {
  console.error("API authentication audit failed to run:", error)
  process.exitCode = 1
})
