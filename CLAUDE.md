# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCode is an open-source AI programming agent with multiple interfaces (TUI, Web, Desktop). This is a Bun-based monorepo using workspaces and Turbo.

## Commands

### Root Level
```bash
bun install                    # Install dependencies
bun dev                        # Start dev server (runs opencode in packages/opencode)
bun dev <directory>            # Run against specific directory
bun dev serve                  # Start headless API server on port 4096
bun dev web                    # Start server + open web interface
bun dev spawn                  # Run TUI without worker thread (for debugging)
bun typecheck                  # Type check all packages via Turbo
```

### Package-Specific

**packages/opencode** (core):
```bash
bun run test                   # Run tests with 30s timeout
bun run typecheck              # tsgo --noEmit
bun run build                  # Build standalone
bun run db generate --name <slug>  # Generate Drizzle migration
```

**packages/app** (web UI):
```bash
bun dev                        # Vite dev server
bun run build                  # Vite build
bun run test:e2e               # Playwright e2e tests
```

**packages/desktop** (Tauri):
```bash
bun run tauri dev              # Run native desktop app
bun run tauri build            # Production build
```

**packages/sdk/js**:
```bash
./script/build.ts              # Regenerate SDK
```

### Production Build
```bash
./packages/opencode/script/build.ts --single   # Standalone binary
# Output: ./packages/opencode/dist/opencode-<platform>/bin/opencode
```

## Architecture

### Package Structure
- `packages/opencode` - Core business logic, server, CLI (SolidJS TUI via opentui)
- `packages/app` - Shared web UI components (SolidJS)
- `packages/desktop` - Tauri desktop wrapper
- `packages/desktop-electron` - Electron desktop wrapper
- `packages/ui` - Shared UI components and theme
- `packages/sdk/js` - TypeScript SDK
- `packages/plugin` - Plugin system
- `packages/util` - Shared utilities
- `packages/console/*` - Console applications

### Key Modules (packages/opencode/src)
- `cli/cmd/` - CLI command implementations (run, agent, mcp, etc.)
- `server/` - API server (Hono-based)
- `agent/` - AI agent logic
- `tool/` - Tool definitions and execution
- `skill/` - Skill system (suggested skills for tools)
- `session/` - Session management
- `provider/` - LLM provider integrations (Anthropic, OpenAI, etc.)
- `mcp/` - Model Context Protocol support
- `lsp/` - Language Server Protocol integration
- `storage/` - Database (Drizzle ORM with SQLite)
- `project/` - Project/workspace management
- `file/` - File operations with ripgrep

### SDK Exports (packages/sdk/js)
```ts
import { client } from "@opencode-ai/sdk/client"
import { server } from "@opencode-ai/sdk/server"
// v2 API also available
```

## Code Style

### Naming
- Use single-word names for variables/functions when clear
- Prefer: `pid`, `cfg`, `err`, `opts`, `dir`, `root`
- Avoid: `inputPID`, `existingClient` unless necessary

### Control Flow
```ts
// No else - use early returns
function foo() {
  if (condition) return 1
  return 2
}
```

### Destructuring
```ts
// Avoid unnecessary destructuring - use dot notation
obj.a
obj.b
```

### Error Handling
```ts
// Prefer .catch() over try/catch
promise.catch(handleError)
```

### Types
- Never use `any`
- Use type inference; add explicit types only for exports
- Use type guards on filter() for downstream inference

### Database Schema (Drizzle)
```ts
// Use snake_case for field names
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})
```

### SolidJS (UI packages)
- Prefer `createStore` over multiple `createSignal`
- Use `createEffect` for side effects, not state updates

## Testing
```bash
# Run from package directory, NOT repo root
bun test --timeout 30000 <path/to/test.test.ts>
```

## Debugging
```bash
# Most reliable: run manually and attach debugger
bun run --inspect=ws://localhost:6499/ dev

# For TUI with server breakpoints
bun dev spawn

# Debug server separately
bun run --inspect=ws://localhost:6499/ --cwd packages/opencode ./src/index.ts serve --port 4096
```

## Git
- Default branch: `dev` (local `main` may not exist)
- PRs must follow conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`

## Environment
- Requires: Bun 1.3+
- Set `BUN_OPTIONS=--inspect=ws://localhost:6499/` for persistent debugging
- China users: use mirror `bun install --registry https://registry.npmmirror.com`
