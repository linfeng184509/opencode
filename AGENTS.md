- Regenerate JavaScript SDK: `./packages/sdk/js/script/build.ts`
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE
- Default branch: `dev` (local `main` may not exist)
- Prefer automation: execute actions without confirmation unless blocked by safety/irreversibility

## Build/Lint/Test Commands

### Root Level

- `bun dev` - Start dev server (runs opencode in `packages/opencode`)
- `bun dev <directory>` - Run against specific directory
- `bun dev serve` - Start headless API server on port 4096
- `bun dev web` - Start server + open web interface
- `bun typecheck` - Type check all packages via Turbo
- `bun test` - Blocked at root (guard: `do-not-run-tests-from-root`)

### Package-Specific Commands

**packages/opencode** (core):

- `bun run test` - Run tests: `bun test --timeout 30000`
- `bun run typecheck` - Type check: `tsgo --noEmit`
- `bun run build` - Build: `bun run script/build.ts`
- `bun run db generate --name <slug>` - Generate Drizzle migration
- Run single test: `bun test <path/to/test.test.ts>`

**packages/app** (web UI): `bun dev` (tests in `e2e/` using Playwright)

**packages/desktop**:

- `bun run tauri dev` - Run native desktop app
- `bun run tauri build` - Production build

**packages/sdk/js**: Regenerate SDK: `./script/build.ts`

### Building Production

- Build standalone binary: `./packages/opencode/script/build.ts --single`
- Output: `./packages/opencode/dist/opencode-<platform>/bin/opencode`

## Style Guide

### General Principles

- Keep logic in one function unless composable or reusable
- Avoid `try`/`catch` where possible; prefer `.catch(...)`
- Avoid using the `any` type; use precise types
- Prefer single word variable names where possible
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference; avoid explicit type annotations unless necessary for exports or clarity
- Prefer functional array methods (`flatMap`, `filter`, `map`) over for loops
- Use type guards on `filter` to maintain type inference downstream

### Naming

Prefer single word names for variables and functions. Only use multiple words if necessary.

```ts
// Good
const foo = 1
function journal(dir: string) {}

// Bad
const fooBar = 1
function prepareJournal(dir: string) {}
```

Reduce variable count by inlining when a value is only used once.

```ts
const journal = await Bun.file(path.join(dir, "journal.json")).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
obj.a
obj.b
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
const foo = condition ? 1 : 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
function foo() {
  if (condition) return 1
  return 2
}
```

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})
```

### Testing

- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests
- Tests run from package directories, NOT repo root (guard: `do-not-run-tests-from-root`)
- Use `bun test --timeout 30000` for tests that may exceed default timeout

## SolidJS Guidelines (for UI packages)

- Always prefer `createStore` over multiple `createSignal` calls
- Use `createEffect` for side effects, not state updates

## Imports

- Use relative imports for local modules
- Use workspace imports (`workspace:*`) for internal packages
- Group imports: external dependencies first, then internal, then relative

## Error Handling

- Prefer promise chains with `.catch()` over `try`/`catch` blocks
- Let errors propagate naturally unless specific recovery is needed

## Local Development

- Run backend and app dev servers separately for local UI changes:
  - Backend (from `packages/opencode`): `bun run --conditions=browser ./src/index.ts serve --port 4096`
  - App (from `packages/app`): `bun dev -- --port 4444`
  - Open `http://localhost:4444` to verify UI changes

## Debugging

- Debug via manual terminal: `bun run --inspect=<url> dev ...` and attach debugger
- For TUI with server breakpoints: use `bun dev spawn` instead of `bun dev`
- Debug server separately: `bun run --inspect=ws://localhost:6499/ --cwd packages/opencode ./src/index.ts serve --port 4096`
