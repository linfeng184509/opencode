# opencode 工具对比

## Bash vs Read/Write

| 操作       | Bash 命令                     | Read/Write 工具 | Token 成本对比                | 推荐      |
| ---------- | ----------------------------- | --------------- | ----------------------------- | --------- |
| 复制文件   | `cp source dest`              | Read + Write    | Bash: 0, RW: 2x 文件大小      | Bash      |
| 文本替换   | `sed -i '' 's/a/b/g' file`    | Read + Edit     | Bash: 0, RW: 1x 文件          | Bash      |
| 追加内容   | `echo "line" >> file`         | Read + Write    | Bash: 0, RW: 1x+ 文件         | Bash      |
| 删除行     | `sed -i '' '/pattern/d' file` | Read + Write    | Bash: 0, RW: 1x 文件          | Bash      |
| 合并文件   | `cat f1 f2 > out`             | Read + Write    | Bash: 0, RW: 2x 读取 +1x 写入 | Bash      |
| 代码理解   | 不适用                        | Read + LSP      | -                             | Read      |
| 复杂编辑   | 不适用                        | Read + Edit     | -                             | Read/Edit |
| 新文件创建 | heredoc                       | Write           | Write 更清晰                  | Write     |

## Bash 命令模式

### 文件复制

```bash
# ✅ 推荐
Bash: cp source.txt dest.txt

# ❌ 浪费
Read: source.txt
Write: dest.txt (content: ...)
```

**Token 节省：100% 文件内容**

### 文本替换

```bash
# ✅ 推荐 (macOS)
Bash: sed -i '' 's/old_value/new_value/g' config.yaml

# ✅ 推荐 (Linux)
Bash: sed -i 's/old_value/new_value/g' config.yaml

# ✅ 跨平台
Bash: sed -i.bak 's/old_value/new_value/g' config.yaml && rm config.yaml.bak

# ❌ 浪费
Read: config.yaml
Edit: config.yaml (old_string: "old_value", new_string: "new_value")
```

**Token 节省：100% 文件内容**

### 使用分隔符（特殊字符）

```bash
# 路径替换
Bash: sed -i '' 's|old/path|new/path|g' config.yaml

# 变量包含斜杠
Bash: sed -i '' 's|https://old.com|https://new.com|g' config.yaml
```

### 追加内容

```bash
# ✅ 推荐
Bash: echo "new log entry" >> app.log

# ✅ 多行追加
Bash: cat >> file.txt << 'EOF'
line 1
line 2
line 3
EOF

# ❌ 浪费
Read: app.log
Write: app.log (existing + new)
```

**Token 节省：100% 现有文件内容**

### 删除行

```bash
# ✅ 推荐
Bash: sed -i '' '/DELETE/d' data.txt

# ✅ 使用 grep
Bash: grep -v "DELETE" data.txt > temp.txt && mv temp.txt data.txt
```

### 提取特定行

```bash
# ✅ 推荐
Bash: sed -n '100,200p' large_file.txt

# ✅ 使用 head/tail
Bash: head -200 large_file.txt | tail -100

# ❌ 浪费
Read: large_file.txt (然后手动找 100-200 行)
```

### 合并文件

```bash
# ✅ 推荐
Bash: cat file1.txt file2.txt > combined.txt

# ✅ 追加
Bash: cat file2.txt >> file1.txt
```

### 创建新文件

```bash
# ✅ 推荐（静态内容）
Write: new-file.md
# 直接写内容

# ✅ 推荐（动态生成）
Bash: cat > output.txt << 'EOF'
generated content
EOF

# ❌ 过度工程
Bash: python3 << 'PYEOF'
with open('output.txt', 'w') as f:
    f.write('content')
PYEOF
```

## Grep vs Codesearch

### Grep（基于 ripgrep）

- 快速文本搜索
- 支持正则
- 带行号和上下文

**适用场景**：

- 精确模式匹配
- 查找字符串
- 定位函数/类

```bash
# 基本搜索
Grep: "def my_function" src/

# 带文件类型过滤
Grep: "import" --include="*.ts"

# 带上下文
Bash: grep -A 10 -B 5 "pattern" file.ts
```

### Codesearch（如果可用）

- 语义代码搜索
- 理解代码结构

**适用场景**：

- 概念搜索
- 相关代码发现

**优先使用 Grep 进行精确模式匹配。**

## Glob vs Ls

### Glob

- 模式匹配
- 递归搜索
- 按修改时间排序

```bash
# 查找 TypeScript 文件
Glob: "**/*.ts"

# 查找测试文件
Glob: "**/*.test.ts"
```

### Ls（如果可用）

- 目录列表
- 非递归

**优先使用 Glob 进行文件发现。**

## 何时打破规则

### 仍然使用 Read/Edit/Write 的情况

1. **复杂逻辑需要**
   - 基于文件结构的条件编辑

2. **代码感知变更**
   - 在函数内编辑，保持缩进

3. **需要验证**
   - 变更前需要验证内容

4. **交互审查**
   - 用户需要在变更前查看内容

5. **多步分析**
   - 需要先理解代码结构

6. **低开销操作**
   - 目录列表
   - 小文件读取（< 100 行）

### 决策树

```
开始
│
├─ 创建新文件？
│  ├─ 结构化内容 → Write 工具
│  └─ 简单内容 → bash heredoc
│
├─ 修改现有文件？
│  ├─ 代码文件 → Read + Edit
│  ├─ 小数据文件（< 100 行）→ Read + Edit
│  └─ 大数据文件 → bash (sed/awk)
│
├─ 文件操作（非内容）？
│  ├─ 复制 → bash: cp
│  ├─ 移动 → bash: mv
│  └─ 删除 → bash: rm
│
└─ 信息收集？
   ├─ 目录结构 → Glob
   ├─ 内容搜索 → Grep
   └─ 小文件查看 → Read (limit: 100)
```
