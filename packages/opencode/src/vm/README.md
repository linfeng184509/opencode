# VM 测试系统

基于 VirtualBox Remote (SSH) 的跨平台 VM 测试系统，支持自动化部署、测试、收集和分析。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Skills Layer                        │
│  (通过 SKILL.md 文件定义，位于 .claude/skills/ 或 .opencode/skill/)
├─────────────────────────────────────────────────────────────┤
│                    Tool Layer                                │
│  VM 管理工具：                                                │
│  - vm_create/vm_start/vm_stop/vm_destroy                    │
│  - vm_snapshot/vm_restore                                   │
│  - vm_exec/vm_upload/vm_download/vm_screenshot              │
│  - vm_list/vm_status                                        │
│                                                             │
│  远程 VirtualBox 工具 (SSH):                                 │
│  - vm_remote_vbox_connect/disconnect                        │
│  - vm_remote_vbox_start/stop                                │
│  - vm_remote_vbox_snapshot/restore                          │
│  - vm_remote_vbox_exec                                      │
│                                                             │
│  测试工具：                                                  │
│  - test_run        运行测试套件                              │
│  - test_simulate   模拟用户操作 (tmux)                       │
│  - test_collect    收集测试结果                              │
├─────────────────────────────────────────────────────────────┤
│                VM Provider Layer                             │
│  - VirtualBoxRemoteProvider (唯一支持，通过 SSH 管理)          │
│    本地：连接到 127.0.0.1:2222 (Vagrant 默认配置)              │
│    远程：连接到远程主机的 SSH 端口                             │
└─────────────────────────────────────────────────────────────┘
```

## 功能特性

### VirtualBox Remote Provider (通过 SSH)
- ✓ 创建/启动/停止/删除 VM
- ✓ 快照管理（创建/恢复/删除）
- ✓ SSH 文件传输（上传/下载）
- ✓ 命令执行（通过 VBoxManage guestcontrol）
- ✓ 跨平台支持（Windows/macOS/Linux）
- ✗ 截图功能（远程 SSH 模式不支持）
- ✗ GUI 支持（headless 模式）

### 工具 (Tools)

#### VM 管理工具

| 工具 | 功能 | 示例 |
|------|------|------|
| `vm_create` | 创建/注册虚拟机 | `vm_create --name test --os ubuntu-22.04` |
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

#### 远程 VirtualBox 工具 (SSH 连接)

| 工具 | 功能 | 示例 |
|------|------|------|
| `vm_remote_vbox_connect` | 连接到 VirtualBox 主机 | `vm_remote_vbox_connect --name home --remote_host 192.168.1.100 --ssh_port 22` |
| `vm_remote_vbox_disconnect` | 断开连接 | `vm_remote_vbox_disconnect --name home` |
| `vm_remote_vbox_start` | 启动 VM | `vm_remote_vbox_start --name home --vm_name test` |
| `vm_remote_vbox_stop` | 停止 VM | `vm_remote_vbox_stop --name home --vm_name test` |
| `vm_remote_vbox_snapshot` | 创建快照 | `vm_remote_vbox_snapshot --name home --vm_name test --tag backup` |
| `vm_remote_vbox_restore` | 恢复快照 | `vm_remote_vbox_restore --name home --vm_name test --tag backup` |
| `vm_remote_vbox_exec` | 执行命令 | `vm_remote_vbox_exec --name home --vm_name test --command "uname -a"` |

#### 测试工具

| 工具 | 功能 | 示例 |
|------|------|------|
| `test_run` | 运行测试套件 | `test_run --name test --type e2e` |
| `test_simulate` | 模拟用户操作 | `test_simulate --name test --actions [...]` |
| `test_collect` | 收集测试结果 | `test_collect --name test --type all` |

### 技能 (Skills)

技能通过 SKILL.md 文件定义，位于以下目录：
- `.claude/skills/` - Claude Code 技能目录
- `.agents/skills/` - 通用 Agent 技能目录
- `.opencode/skill/` - OpenCode 技能目录

示例技能文件：`.claude/skills/vm-test/SKILL.md`

```markdown
---
name: vm_test
description: 在虚拟机中执行完整测试流程
---

使用 vm_create, vm_start, test_run, test_collect 工具执行测试...
```

## 使用示例

### 1. 本地连接 (Vagrant 默认配置)

```bash
# 连接到本地 VirtualBox (通过 SSH 2222 端口)
bun dev --tool vm_remote_vbox_connect --name local --ssh_port 2222

# 创建/注册虚拟机
bun dev --tool vm_create --name test --os ubuntu-22.04 --cpu 4 --memory 8192

# 启动虚拟机
bun dev --tool vm_start --name test
```

### 2. 远程连接

```bash
# 连接到远程 VirtualBox 主机
bun dev --tool vm_remote_vbox_connect \
  --name home \
  --remote_host 192.168.1.100 \
  --ssh_port 22 \
  --ssh_username vagrant \
  --private_key_path ~/.vagrant.d/insecure_private_key

# 启动远程虚拟机
bun dev --tool vm_remote_vbox_start \
  --name home \
  --vm_name opencode-test
```

### 3. 执行测试

```bash
# 运行单元测试
bun dev --tool test_run --name test --type unit

# 运行 E2E 测试
bun dev --tool test_run --name test --type e2e

# 模拟 TUI 用户操作
bun dev --tool test_simulate \
  --name test \
  --actions '[{"type":"type","value":"你好","delay":1000},{"type":"wait","delay":5000}]'

# 收集测试结果
bun dev --tool test_collect --name test --type all --output_dir results
```

### 4. 快照管理

```bash
# 创建快照
bun dev --tool vm_snapshot --name test --tag before-change

# 恢复快照
bun dev --tool vm_restore --name test --tag before-change
```

## 平台支持

| 功能 | VirtualBox Remote (SSH) |
|------|------------------------|
| 创建 VM | ✓ (通过 SSH 管理) |
| 启动/停止 | ✓ |
| 快照 | ✓ |
| 截图 | ✗ (远程 SSH 模式不支持) |
| GUI 支持 | ✗ (headless 模式) |
| SSH 执行 | ✓ |
| 文件同步 | ✓ (通过 SSH) |
| 跨平台 | ✓ (需要 SSH 访问) |

## 工作流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  SSH 连接    │ ──▶ │  创建快照   │ ──▶ │  部署代码   │
│  connect    │     │ vm_snapshot │     │ vm_upload   │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  生成报告   │ ◀── │  收集结果   │ ◀── │  执行测试   │
│   report    │     │ test_collect│     │  test_run   │
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
- Vagrant (推荐，用于快速部署 VM)
- SSH 客户端
- Bun 1.3+

## 配置

### Vagrant VM 配置示例 (Vagrantfile)

```ruby
Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/jammy64"
  config.vm.network "forwarded_port", guest: 22, host: 2222
  config.vm.provider "virtualbox" do |vb|
    vb.memory = "8192"
    vb.cpus = 4
  end
end
```

### 连接到 Vagrant VM

```bash
# 启动 Vagrant VM
vagrant up

# 连接到 VirtualBox
bun dev --tool vm_remote_vbox_connect \
  --name vagrant \
  --ssh_port 2222 \
  --ssh_username vagrant \
  --private_key_path ~/.vagrant.d/insecure_private_key
```

## 故障排除

### SSH 连接失败
```
错误：SSH 连接超时
解决：
  1. 检查 VM 是否正在运行
  2. 确认 SSH 服务已启动 (systemctl status ssh)
  3. 检查端口转发配置 (Vagrant: vagrant port)
  4. 验证私钥权限 (chmod 600 ~/.vagrant.d/insecure_private_key)
```

### VirtualBox 未找到
```
错误：VBoxManage 命令失败
解决：
  1. 安装 VirtualBox 7.0+
  2. 确保 VBoxManage 在 PATH 中
  3. 远程连接时，在远程主机安装 VirtualBox
```

### 权限错误
```
错误：permission denied
解决：
  1. 检查 SSH 用户名是否正确
  2. 使用正确的私钥或密码
  3. 确保 VM 用户有执行 VBoxManage 的权限
```

## 文件结构

```
packages/opencode/src/vm/
├── base.ts                     # 基础接口定义
├── ssh-client.ts               # SSH 客户端
├── virtualbox-remote-provider.ts # VirtualBox Remote 提供者
├── registry.ts                 # 提供者注册表
└── index.ts                    # 导出

packages/opencode/src/tool/
├── vm.ts                       # VM 管理工具
├── vm-remote-vbox.ts           # 远程 VirtualBox 工具
└── test.ts                     # 测试执行工具
```

## 扩展

### 添加新的 Skill

1. 在 `.claude/skills/` 或 `.opencode/skill/` 创建 SKILL.md 文件
2. 定义 skill 名称和描述
3. 在内容中编写使用工具的指令

### 添加新的 Provider

当前仅支持 VirtualBox Remote，如需添加其他 Provider：

1. 实现 `VMProviderBase` 接口
2. 在 `registry.ts` 中注册
3. 更新文档
