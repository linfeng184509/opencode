# 文件操作决策树

## 完整决策流程

```
开始
│
├─ 1. 创建新文件？
│   │
│   ├─ 是，结构化内容（文档、配置）
│   │   └─ → Write 工具直接写入
│   │
│   └─ 是，模板/动态内容
│       └─ → bash heredoc
│
├─ 2. 修改现有文件？
│   │
│   ├─ 代码文件（.ts/.js/.py/.rs 等）
│   │   ├─ 首次理解结构 → Read (limit: 100) + LSP
│   │   ├─ 复杂编辑 → Read + Edit
│   │   └─ 简单替换 → 考虑 bash (sed)
│   │
│   ├─ 数据文件（.json/.yaml/.csv/.xml 等）
│   │   ├─ 小文件（< 100 行）
│   │   │   └─ → Read + Edit
│   │   │
│   │   ├─ 大文件，简单替换
│   │   │   └─ → bash (sed/awk)
│   │   │
│   │   └─ 关键数据（统计、报告）
│   │       └─ → bash + 日志记录
│   │
│   └─ 二进制/媒体文件
│       └─ → bash (cp/mv/转换工具)
│
├─ 3. 文件操作（非内容修改）？
│   │
│   ├─ 复制文件
│   │   └─ → bash: cp source dest
│   │
│   ├─ 移动文件
│   │   └─ → bash: mv source dest
│   │
│   ├─ 重命名文件
│   │   └─ → bash: mv old new
│   │
│   ├─ 删除文件
│   │   └─ → bash: rm file
│   │
│   └─ 批量重命名
│       └─ → bash for 循环或 rename
│
└─ 4. 信息收集？
    │
    ├─ 目录结构探索
    │   └─ → Glob "**/*"
    │
    ├─ 内容搜索
    │   ├─ 精确模式 → Grep "pattern"
    │   └─ 概念搜索 → Codesearch（如果可用）
    │
    ├─ 查看文件内容
    │   ├─ 小文件（< 100 行）→ Read (limit: 100)
    │   ├─ 大文件开头 → Read (limit: 50)
    │   ├─ 大文件结尾 → bash: tail -50 file
    │   └─ 特定部分 → Read (offset: X, limit: Y)
    │
    └─ 统计信息
        ├─ 行数 → bash: wc -l file
        ├─ 文件计数 → bash: find . -name "*.ts" | wc -l
        └─ 目录大小 → bash: du -sh dir
```

## 关键数据文件日志模式

当修改关键数据文件（基因组统计、丰富表格、报告数据）时，记录所有操作以便审计和重现。

### 基本模式

```bash
# 定义日志文件
LOG_FILE="data_modifications.log"

# 创建日志（如果不存在）
if [ ! -f "$LOG_FILE" ]; then
    echo "# Data modification log - $(date)" > "$LOG_FILE"
fi

# 记录并执行
echo "sed -i '' 's/old_value/new_value/g' genome_stats.csv" >> "$LOG_FILE"
sed -i '' 's/old_value/new_value/g' genome_stats.csv
```

### 使用 tee 记录

```bash
# 记录并执行 awk
echo "awk '{if (NR==1 || \$3 > 100) print}' data.csv > filtered.csv" | tee -a "$LOG_FILE"
awk '{if (NR==1 || $3 > 100) print}' data.csv > filtered.csv
```

### 日志文件格式

```bash
# genome_stats_modifications.log
sed -i '' 's/NA/0/g' genome_stats.csv
awk '{if ($5 != "") print}' genome_stats.csv > genome_stats_filtered.csv
sed -i '' 's/Chromosome/Chr/g' genome_stats.csv
```

### Python 脚本中的日志

```python
import subprocess
import datetime

LOG_FILE = "data_modifications.log"

def log_and_run(command, description=""):
    """记录命令并执行"""
    timestamp = datetime.datetime.now().isoformat()
    with open(LOG_FILE, 'a') as log:
        log.write(f"# {timestamp} - {description}\n")
        log.write(f"{command}\n\n")

    subprocess.run(command, shell=True, check=True)

# 使用示例
log_and_run(
    "sed -i '' 's/NA/0/g' genome_stats.csv",
    "Replace NA with 0"
)
```

## 安全 Glob 模式

### 问题

```bash
# ❌ 错误：没有匹配文件时语法错误
for file in *.md; do
    cp "$file" backup/
done
# 错误：syntax error near unexpected token '2'
```

### 解决方案 1：nullglob

```bash
# ✅ 正确：使用 nullglob
shopt -s nullglob
for pattern in "*.md" "*.sh" "*.txt"; do
    for file in $pattern; do
        cp "$file" backup/
    done
done
shopt -u nullglob  # 恢复默认行为
```

**工作原理**：

- `nullglob`：如果 glob 模式没有匹配，展开为空字符串（无错误）
- `shopt -u nullglob`：使用后关闭（防止副作用）

### 解决方案 2：显式检查

```bash
# ✅ 正确：先检查文件存在
if ls *.md 1> /dev/null 2>&1; then
    for file in *.md; do
        cp "$file" backup/
    done
fi
```

### 何时使用

| 场景               | 推荐方法 |
| ------------------ | -------- |
| 循环中多个模式     | nullglob |
| 单个模式，需要确认 | 显式检查 |
| 条件执行           | 显式检查 |

## CSV 列索引查找

```bash
# ❌ 不要：读取整个 CSV 找列号
Read: large_table.csv

# ✅ 推荐：提取并编号表头
Bash: head -1 file.csv | tr ',' '\n' | nl

# ✅ 推荐：按模式查找特定列
Bash: head -1 data.csv | tr ',' '\n' | nl | grep -i "chrom"
# 输出显示列号和名称：
#  54 num_chromosomes
# 106 total_number_of_chromosomes
```

**工作原理**：

- `head -1`：获取表头行
- `tr ',' '\n'`：逗号分隔转 newline
- `nl`：编号行（给出列索引）
- `grep -i`：按模式过滤（不区分大小写）

**适用场景**：快速识别宽表（100+ 列）中的列。

## Python 数据过滤模式

```python
import csv

# ✅ 推荐：创建独立的过滤后文件
# 读取原始数据
species_data = []
with open('data.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['accession'] and row['chromosome_count']:  # 过滤条件
            species_data.append(row)

# 写入 NEW 文件（带描述性后缀）
output_file = 'data_filtered.csv'  # 不是 'data.csv'
with open(output_file, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=reader.fieldnames)
    writer.writeheader()
    writer.writerows(species_data)
```

**优势**：

- 保留原始数据用于比较
- 清晰的命名表明应用的过滤
- 可以生成多个过滤版本
- 更容易调试和验证过滤逻辑

## 决策示例

### 示例 1：更新配置文件

**场景**：将 10 个配置文件中的 `old_value` 替换为 `new_value`

```bash
# ✅ 推荐
Bash: for f in config*.yaml; do sed -i '' 's/old/new/g' "$f"; done
# Token 成本：~100 tokens

# ❌ 浪费
Read: config1.yaml  # 5K tokens
Edit: config1.yaml
Read: config2.yaml  # 5K tokens
Edit: config2.yaml
# ... 重复 10 次 = 50K tokens
```

**节省：99.8%**

### 示例 2：复制配置模板

```bash
# ✅ 推荐
Bash: cp template_config.yaml project_config.yaml
# Token 成本：~50 tokens

# ❌ 浪费
Read: template_config.yaml  # 10K tokens
Write: project_config.yaml  # 10K tokens
# 总计：20K tokens
```

**节省：99.75%**

### 示例 3：追加日志条目

```bash
# ✅ 推荐
Bash: echo "[$(date)] Log entry" >> application.log
# Token 成本：~50 tokens

# ❌ 浪费
Read: application.log  # 50K tokens (大文件)
Write: application.log  # 50K tokens
# 总计：100K tokens
```

**节省：99.95%**

### 示例 4：理解代码结构

```bash
# ✅ 推荐：阶段式方法
# 阶段 1：概览
Bash: find . -name "*.ts" | head -30
Grep: "^export class" -r src/
Read: README.md

# 阶段 2：针对性
Grep: "class MyClass" src/
Read: src/my-class.ts (limit: 100)

# 阶段 3：深入（如需要）
Read: src/my-class.ts
```

## 快速参考表

| 任务       | 推荐工具                 | 理由          |
| ---------- | ------------------------ | ------------- |
| 复制文件   | `bash: cp`               | 零 token 成本 |
| 移动文件   | `bash: mv`               | 零 token 成本 |
| 删除文件   | `bash: rm`               | 零 token 成本 |
| 文本替换   | `bash: sed`              | 零 token 成本 |
| 追加内容   | `bash: echo >>`          | 零 token 成本 |
| 删除行     | `bash: sed '/pattern/d'` | 零 token 成本 |
| 合并文件   | `bash: cat`              | 零 token 成本 |
| 创建新文件 | `Write`                  | 结构化内容    |
| 代码编辑   | `Read + Edit`            | 代码感知      |
| 小数据编辑 | `Read + Edit`            | 可见变更      |
| 大数据编辑 | `bash: sed/awk`          | 效率          |
| 关键数据   | `bash + 日志`            | 可审计性      |
| 文件搜索   | `Glob`                   | 模式匹配      |
| 内容搜索   | `Grep`                   | 快速定位      |
| 目录列表   | `Read` (目录)            | 低开销        |
| 代码理解   | `Read + LSP`             | 结构感知      |
