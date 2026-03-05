# OpenCode 项目运行指南

## 环境要求

- **Bun**: 1.3+ (必需)
- Node.js (可选)

## 运行步骤

### 1. 安装依赖

```bash
bun install
```

> 国内用户可使用镜像：`bun install --registry https://registry.npmmirror.com`

### 2. 运行项目

```bash
# 启动 TUI (终端界面 )
bun dev

# 或指定工作目录
bun dev <directory>

# 启动 API 服务器 (端口 4096)
bun dev serve

# 启动 Web 界面 (需先运行 API 服务器)
bun dev web
```

## 其他运行命令

### Web 应用开发

```bash
bun --cwd packages/app dev
```

### 桌面应用开发

```bash
# 仅 Web 开发服务器
bun --cwd packages/desktop dev

# Tauri 原生桌面应用
bun --cwd packages/desktop tauri dev
```

### 构建

```bash
# 构建独立可执行文件
./packages/opencode/script/build.ts --single
```

### 类型检查

```bash
bun typecheck
```

### 格式化代码

```bash
cd packages/opencode
bun run format
```

## 测试

```bash
cd packages/opencode
bun test                      # 运行所有测试
bun test <pattern>            # 运行匹配模式的测试
bun test -t "test name"       # 按名称运行测试
bun test --coverage           # 带覆盖率
```

> ⚠️ **注意**: 测试不能从根目录运行，必须进入 `packages/opencode` 目录

## 项目结构

这是一个 monorepo 项目，使用 Bun workspaces:

```
packages/
├── opencode/          # 核心后端服务 & CLI
├── app/               # Web 应用组件
├── desktop/           # Tauri 桌面应用
├── console/           # 控制台应用
├── web/               # Web 前端
├── sdk/               # SDK (JS/TS)
├── plugin/            # 插件系统
├── ui/                # 共享 UI 组件
└── util/              # 工具函数
```

## 技术栈

- **运行时**: Bun
- **语言**: TypeScript
- **前端框架**: SolidJS
- **UI 样式**: Tailwind CSS v4
- **后端框架**: Hono
- **数据库**: Drizzle ORM (SQLite)
- **AI SDK**: Vercel AI SDK (多提供商支持)
- **桌面**: Tauri
- **包管理**: Bun workspaces

## 开发配置

### 调试器设置

VSCode 用户可参考 `.vscode/launch.example.json` 配置调试器：

1. 手动在终端运行：`bun run --inspect=ws://localhost:6499/ --cwd packages/opencode ./src/index.ts`
2. 附加调试器到 `ws://localhost:6499/`

### Git 分支

- **默认分支**: `dev`
- **上游仓库**: https://github.com/anomalyco/opencode.git

## 开发约束规则

⚠️ **所有开发人员必须遵守以下规则:**

### 1. 禁止简化逃避问题

- 遇到问题必须彻底解决，不得绕过或忽略
- 不得删除报错的代码来"修复"问题
- 不得将错误静默吞掉而不处理
- 必须找到问题的根本原因并修复

### 2. 禁止硬编码

- 不得在代码中硬编码路径、URL、密钥、配置值
- 使用环境变量或配置文件管理敏感信息
- 路径必须使用 `path.join()` 等跨平台方法
- 配置值必须从 `Config` 模块或环境变量读取

```ts
// ❌ 错误 - 硬编码
const apiKey = "sk-1234567890"
const configPath = "/Users/name/.opencode/config"

// ✅ 正确
const apiKey = process.env.OPENCODE_API_KEY
const configPath = path.join(Global.Path.data, "config")
```

### 3. 禁止使用 any 类型

- 不得使用 `any` 类型，必须使用精确的类型定义
- 如类型未知，使用 `unknown` 并进行类型守卫
- 函数返回值必须明确类型
- 使用类型守卫确保类型安全

```ts
// ❌ 错误
function process(data: any) { ... }

// ✅ 正确
function process(data: unknown): Result {
  if (!isValidInput(data)) throw new Error("Invalid input")
  // 类型守卫后的安全使用
  ...
}
```

### 4. 禁止提交未测试通过的代码

- 提交前必须运行相关测试确保通过
- 新增功能必须添加对应测试
- 修复 bug 必须添加回归测试
- 提交前运行：`bun test` 和 `bun run typecheck`

**提交前检查清单:**

```bash
cd packages/opencode
bun test                    # 运行测试
bun run typecheck           # 类型检查
bun run format              # 格式化代码
git diff --check            # 检查空白错误
```

### 5. 代码审查要求

- 所有 PR 必须链接 Issue (`Fixes #123`)
- PR 描述必须说明如何验证代码工作正常
- UI 变更必须附带截图
- 禁止粘贴 AI 生成的长篇大论

### 6. 违反后果

- 违反上述规则的代码将在 Code Review 中被拒绝
- 多次违反可能导致 PR 被关闭
- 严重违反可能被移出贡献者名单

---

### 如何运行 against 不同的目录？

```bash
bun dev /path/to/other/project
```

### 如何构建生产版本？

```bash
cd packages/opencode
bun run build
```

### 如何重新生成 SDK？

```bash
./packages/sdk/js/script/build.ts
```

bun run --cwd packages/opencode build --single --skip-install