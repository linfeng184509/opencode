---
name: token-efficiency
description: Token 优化最佳实践，专为 opencode 设计。包括工具选择策略（bash vs read/write）、代码阅读优化、输出过滤等。适用于所有使用 opencode 的开发场景。
version: 1.0.0
---

# Token Efficiency for opencode

## 核心原则

**默认假设：用户偏好高效、节省 token 的协助。**

- 优先使用 bash 命令代替 Read/Write 工具
- 永远不要读取整个日志文件
- 使用 grep/glob 先搜索，再针对性阅读
- 读取文件时使用 limit/offset 参数
- 过滤命令输出，避免大规模转储

---

## opencode 工具选择指南

### Bash 工具（优先使用）

**适用场景**：

- 文件复制/移动/删除
- 文本替换（sed）
- 文件内容提取（head/tail/awk）
- 目录操作
- 进程管理

**示例**：

```bash
# 复制文件（零 token 成本）
Bash: cp source.txt dest.txt

# 文本替换
Bash: sed -i '' 's/old/new/g' config.yaml

# 提取文件片段
Bash: head -100 large_file.txt
Bash: tail -50 app.log
Bash: sed -n '100,200p' file.txt

# 追加内容
Bash: echo "new line" >> file.txt

# 删除行
Bash: sed -i '' '/DELETE/d' data.txt

# 合并文件
Bash: cat file1.txt file2.txt > combined.txt
```

### Grep 工具（搜索优先）

**适用场景**：

- 查找代码模式
- 搜索错误信息
- 定位函数/类定义

**示例**：

```bash
# 查找函数定义
Grep: "def my_function" src/

# 查找类定义
Grep: "class MyClass" src/

# 查找 TODO/FIXME
Grep: "TODO|FIXME" -r .

# 带上下文
Bash: grep -A 5 -B 5 "pattern" file.ts
```

**优于 Read 的场景**：

```
❌ 先 Read 整个文件再手动查找
✅ 用 Grep 直接定位，然后只读相关部分
```

### Glob 工具（文件发现）

**适用场景**：

- 按模式查找文件
- 目录结构探索
- 替代 `ls -R`

**示例**：

```bash
# 查找所有 TypeScript 文件
Glob: "**/*.ts"

# 查找测试文件
Glob: "**/*.test.ts"

# 查找配置文件
Glob: "**/*.{json,yaml,yml}"
```

### Read 工具（限制性使用）

**仅当必要时使用**：

1. 理解代码结构（首次学习）
2. 复杂编辑前的上下文理解
3. 小文件（< 100 行）
4. 需要 LSP 集成的场景

**使用限制**：

```
- 始终使用 limit 参数：Read(file, limit: 100)
- 使用 offset 读取特定部分
- 避免读取日志文件（用 bash tail/grep）
```

**示例**：

```bash
# 读取文件开头
Read: main.ts (limit: 50)

# 读取特定部分
Read: module.ts (offset: 100, limit: 50)

# 读取目录
Read: src/components/ (limit: 50)
```

### Write/Edit 工具

**Write 使用场景**：

- 创建新文件（直接用 Write，不要 bash 脚本）
- 结构化内容（文档、配置文件）

**Edit 使用场景**：

- 代码文件修改（保持结构）
- 小数据文件修改

---

## 文件操作决策树

完整决策树参见：`references/decision-tree.md`

**快速参考**：

```
1. 创建新文件？ → Write 工具直接写入
2. 修改代码文件？ → Read + Edit（理解结构）
3. 修改小数据文件（< 100 行）？ → Read + Edit 可接受
4. 修改大数据文件？ → bash (sed/awk)
5. 复制/移动文件？ → bash (cp/mv)
6. 低开销操作（< 100 行输出）？ → 直接用上下文
```

---

## TypeScript/JavaScript 代码规范

基于 opencode 项目风格指南（AGENTS.md）

### 命名规范

```typescript
// ✅ 推荐：单一单词命名
const foo = 1
function journal(dir: string) {}

// ❌ 避免：多单词（除非必要）
const fooBar = 1
function prepareJournal(dir: string) {}
```

### 变量声明

```typescript
// ✅ 推荐：const 优先，内联单次使用的值
const foo = condition ? 1 : 2
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// ❌ 避免：let 重新赋值
let foo = 1
if (condition) {
  foo = 2
}
```

### 解构

```typescript
// ✅ 推荐：避免不必要的解构，用点 notation
obj.a
obj.b

// ❌ 避免：过度解构
const { a, b } = obj
```

### 控制流

```typescript
// ✅ 推荐：early returns，避免 else
function foo() {
  if (condition) return 1
  return 2
}

// ❌ 避免：else 语句
function foo() {
  if (condition) {
    return 1
  } else {
    return 2
  }
}
```

### 错误处理

```typescript
// ✅ 推荐：promise chains with .catch()
fetchData().then(process).catch(handleError)

// ❌ 避免：try/catch（除非必要）
try {
  const data = await fetchData()
  process(data)
} catch (error) {
  handleError(error)
}
```

### 数组方法

```typescript
// ✅ 推荐：函数式方法
items.filter((x) => x.active).map((x) => x.name)

// ❌ 避免：for 循环
const result = []
for (const item of items) {
  if (item.active) result.push(item.name)
}
```

### 类型注解

```typescript
// ✅ 推荐：依赖类型推断
const foo = 1
function process(data) {
  return data.trim()
}

// ❌ 避免：显式注解（除非导出或需要澄清）
const foo: number = 1
function process(data: string): string {
  return data.trim()
}
```

### Drizzle Schema

```typescript
// ✅ 推荐：snake_case 字段名
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})
```

### SolidJS（UI 包）

```typescript
// ✅ 推荐：createStore 优先
const [state, setState] = createStore({ count: 0 })

// ❌ 避免：多个 createSignal
const [count, setCount] = createSignal(0)
const [name, setName] = createSignal("")
```

### 导入规范

```typescript
// ✅ 推荐：分组导入
// 外部依赖
import { A } from "external"
// 内部包
import { B } from "workspace:*"
// 相对路径
import { C } from "./local"
```

---

## 代码阅读策略

### 学习模式（理解代码库）

**阶段 1：概览**

```bash
# 列出文件
Bash: find . -name "*.ts" | head -30

# 列出类
Grep: "^export class" -r src/

# 列出函数
Grep: "^export function" -r src/

# 阅读项目文档
Read: README.md
Read: AGENTS.md
```

**阶段 2：针对性阅读**

```bash
# 定位相关代码
Grep: "class MyClass" src/

# 阅读结构
Read: src/module.ts (limit: 100)

# 阅读关键模块
Read: src/key-module.ts
```

**阶段 3：深入理解**

```bash
# 阅读完整实现
Read: src/important-module.ts

# 查看使用示例
Grep: "MyClass" -r --include="*.ts" | head -20
```

### 调试模式

**快速诊断**：

```bash
# 1. 看错误摘要
Bash: tail -100 error.log | grep -i "error\|exception"

# 2. 计数错误
Bash: grep -c "ERROR" app.log

# 3. 定位相关代码
Grep: "functionName" src/

# 4. 只读相关部分
Read: src/file.ts (offset: 120, limit: 50)
```

---

## 输出优化

### 过滤命令输出

```bash
# ❌ 避免：无限制输出
Bash: find / -name "*.ts"

# ✅ 推荐：限制输出
Bash: find . -name "*.ts" | head -50
Bash: find . -name "*.ts" -type f | wc -l  # 先计数
```

### 安全 Glob 模式

```bash
# ❌ 错误：没有匹配时语法错误
for file in *.md; do cp "$file" backup/; done

# ✅ 正确：使用 nullglob
shopt -s nullglob
for pattern in "*.md" "*.sh"; do
  for file in $pattern; do
    cp "$file" backup/
  done
done
shopt -u nullglob
```

### 总结而非转储

当解释输出时：

- 提供摘要统计
- 突出关键项
- 询问是否需要详细信息

**示例**：

```
此目录包含 487 个文件：
- 235 个 Python 文件
- 142 个测试文件
- 89 个配置文件

主入口：main.py
文档在：docs/

需要查看特定文件类型吗？
```

---

## 何时打破规则

**覆盖效率规则的情况**：

1. **用户明确要求完整输出**
   - "显示整个日志文件"
   - "读取完整源代码"

2. **过滤输出缺乏必要上下文**
   - 错误引用不在过滤范围内的行号
   - 需要理解完整数据流

3. **文件已知很小**
   - < 200 行
   - 配置文件
   - 小型文档

4. **学习代码结构和架构**
   - 用户探索新代码库
   - 学习编码模式
   - 理解模块结构

**在学习模式下**：

- ✅ 阅读完整文件展示模式和结构
- ✅ 阅读多个相关文件展示交互
- ✅ 展示完整函数/类实现示例
- ⚠️ 但仍战略性选择（不要一次读 50 个文件）

---

## 参考资料

- [工具对比](references/tool-comparison.md) - 详细工具选择指南
- [决策树](references/decision-tree.md) - 文件操作决策流程图
