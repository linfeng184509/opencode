# VM 测试系统

基于 VirtualBox 的跨平台 VM 测试系统，支持自动化部署、测试、收集和分析。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Skills Layer                        │
│  - vm_deploy       部署代码到 VM                             │
│  - full_test_flow  完整测试流程                              │
│  - iterative_fix   迭代修复                                  │
├─────────────────────────────────────────────────────────────┤
│                    Tool Layer                                │
│  - vm_create/vm_start/vm_stop/vm_destroy                    │
│  - vm_snapshot/vm_restore                                   │
│  - vm_exec/vm_upload/vm_download/vm_screenshot              │
│  - test_run/test_simulate/test_collect                      │
├─────────────────────────────────────────────────────────────┤
│                VM Provider Layer                             │
│  - VirtualBoxProvider (首选，功能最全)                        │
│  - DockerProvider (轻量级备用)                               │
│  - WSLProvider (Windows 专用)                                │
└─────────────────────────────────────────────────────────────┘
```

## 功能特性

### VirtualBox Provider
- ✓ 创建/启动/停止/删除 VM
- ✓ 快照管理（创建/恢复/删除）
- ✓ 截图功能
- ✓ SSH 文件传输
- ✓ 命令执行
- ✓ 跨平台支持（Windows/macOS/Linux）

### 工具 (Tools)

| 工具 | 功能 | 示例 |
|------|------|------|
| `vm_create` | 创建虚拟机 | `vm_create --name test --os ubuntu-22.04` |
| `vm_start` | 启动虚拟机 | `vm_start --name test` |
| `vm_stop` | 停止虚拟机 | `vm_stop --name test` |
| `vm_destroy` | 删除虚拟机 | `vm_destroy --name test` |
| `vm_snapshot` | 创建快照 | `vm_snapshot --name test --tag backup` |
| `vm_restore` | 恢复快照 | `vm_restore --name test --tag backup` |
| `vm_exec` | 执行命令 | `vm_exec --name test --command "ls -la"` |
| `vm_upload` | 上传文件 | `vm_upload --name test --local_path ./dist --remote_path /workspace` |
| `vm_download` | 下载文件 | `vm_download --name test --remote_path /workspace/logs --local_path ./logs` |
| `vm_screenshot` | 截图 | `vm_screenshot --name test --output_path screen.png` |
| `vm_list` | 列出 VM | `vm_list` |
| `vm_status` | 获取状态 | `vm_status --name test` |
| `test_run` | 运行测试 | `test_run --name test --type e2e` |
| `test_simulate` | 模拟用户 | `test_simulate --name test --actions [...]` |
| `test_collect` | 收集结果 | `test_collect --name test --type all` |

### 技能 (Skills)

#### vm_deploy
部署代码到虚拟机并启动服务。

```json
{
  "skill": "vm_deploy",
  "params": {
    "vm_name": "opencode-test",
    "project_path": "/workspace/opencode",
    "start_service": true,
    "install_deps": true,
    "build": true,
    "snapshot_before": true
  }
}
```

#### full_test_flow
执行完整的测试流程（部署 -> 测试 -> 收集 -> 分析）。

```json
{
  "skill": "full_test_flow",
  "params": {
    "vm_name": "opencode-test",
    "test_scenarios": ["chat", "code-generation", "file-edit"],
    "collect_logs": true,
    "collect_screenshots": true,
    "ai_analyze": true,
    "create_report": true
  }
}
```

#### iterative_fix
根据测试结果进行迭代修复。

```json
{
  "skill": "iterative_fix",
  "params": {
    "vm_name": "opencode-test",
    "max_iterations": 3,
    "auto_commit": false
  }
}
```

## 使用示例

### 1. 创建并部署测试 VM

```bash
# 创建虚拟机
bun dev --tool vm_create --name opencode-test --os ubuntu-22.04 --cpu 4 --memory 8192

# 启动虚拟机
bun dev --tool vm_start --name opencode-test

# 部署代码
bun dev --skill vm_deploy --vm_name opencode-test --project_path /workspace/opencode
```

### 2. 执行完整测试流程

```bash
# 一键执行完整测试流程
bun dev --skill full_test_flow \
  --vm_name opencode-test \
  --test_scenarios chat,code-generation,file-edit \
  --collect_logs true \
  --collect_screenshots true
```

### 3. 模拟用户操作

```bash
# 模拟 TUI 用户操作
bun dev --tool test_simulate \
  --name opencode-test \
  --actions '[{"type":"type","value":"你好","delay":1000},{"type":"wait","delay":5000}]'
```

### 4. 收集测试结果

```bash
# 收集所有测试结果
bun dev --tool test_collect \
  --name opencode-test \
  --type all \
  --output_dir results
```

### 5. 迭代修复

```bash
# 自动迭代修复
bun dev --skill iterative_fix \
  --vm_name opencode-test \
  --max_iterations 3
```

## 平台支持

| 功能 | VirtualBox | Docker | WSL |
|------|-----------|--------|-----|
| 创建 VM | ✓ | ✓ | ✓ |
| 启动/停止 | ✓ | ✓ | ✓ |
| 快照 | ✓ | ✓ | ✗ |
| 截图 | ✓ | ✗ | ✗ |
| GUI 支持 | ✓ | ✗ | ✗ |
| SSH 执行 | ✓ | ✓ | ✓ |
| 文件同步 | ✓ | ✓ | ✓ |
| 跨平台 | ✓ | ✓ | Windows only |

## 工作流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  创建 VM    │ ──▶ │  创建快照   │ ──▶ │  部署代码   │
│  vm_create  │     │ vm_snapshot │     │ vm_deploy   │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  生成报告   │ ◀── │  AI 分析    │ ◀── │  执行测试   │
│   report    │     │   analyze   │     │  test_run   │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  迭代修复   │ ──▶ │  恢复快照   │
│ fix_skill   │     │ vm_restore  │
└─────────────┘     └─────────────┘
```

## 依赖

- VirtualBox 7.0+ (https://www.virtualbox.org)
- Bun 1.3+
- Node.js 20+
- ssh2 (用于 SSH 连接)

## 配置

在 `.opencode/config.json` 中添加：

```json
{
  "vm": {
    "default_provider": "virtualbox",
    "default_os": "ubuntu-22.04",
    "default_cpu": 4,
    "default_memory": "8192",
    "default_disk": "40G"
  }
}
```

## 故障排除

### VirtualBox 未找到
```
错误：VBoxManage --version 命令失败
解决：安装 VirtualBox 并确保 VBoxManage 在 PATH 中
```

### SSH 连接失败
```
错误：SSH 连接超时
解决：检查 VM 网络设置，确保端口转发正确配置
```

### 截图失败
```
错误：VM 未运行
解决：确保 VM 正在运行状态
```

## 文件结构

```
packages/opencode/src/vm/
├── base.ts              # 基础接口定义
├── ssh-client.ts        # SSH 客户端
├── virtualbox-provider.ts # VirtualBox 提供者
├── docker-provider.ts   # Docker 提供者
├── wsl-provider.ts      # WSL 提供者
├── registry.ts          # 提供者注册表
└── index.ts             # 导出

packages/opencode/src/tool/
├── vm.ts                # VM 管理工具
└── test.ts              # 测试执行工具

packages/opencode/src/skill/
├── vm-deploy.ts         # 部署技能
├── full-test-flow.ts    # 完整测试流程技能
└── iterative-fix.ts     # 迭代修复技能
```

## 扩展

### 添加新的 VM Provider

1. 实现 `VMProviderBase` 接口
2. 在 `registry.ts` 中注册
3. 更新平台检测逻辑

### 添加新的测试场景

1. 在 `full-test-flow.ts` 中添加场景配置
2. 定义用户操作序列
3. 添加结果验证逻辑
