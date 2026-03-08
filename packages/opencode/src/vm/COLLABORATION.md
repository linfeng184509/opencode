# VM 系统协作图

## 1. 系统架构图

```mermaid
graph TB
    subgraph "Agent/Skill Layer"
        A1[用户请求]
        A2[SKILL.md 定义的技能]
        A3[Agent 决策]
    end

    subgraph "Tool Layer"
        B1[VM 管理工具<br/>vm.ts]
        B2[远程 VirtualBox 工具<br/>vm-remote-vbox.ts]
        B3[测试工具<br/>test.ts]
    end

    subgraph "Provider Layer"
        C1[VirtualBoxRemoteProvider<br/>virtualbox-remote-provider.ts]
    end

    subgraph "Transport Layer"
        D1[SSH Client<br/>ssh-client.ts]
    end

    subgraph "Infrastructure"
        E1[VirtualBox API<br/>VBoxManage]
        E2[远程 VM<br/>Ubuntu/CentOS等]
    end

    A1 --> A3
    A2 --> A3
    A3 --> B1
    A3 --> B2
    A3 --> B3
    B1 --> C1
    B2 --> C1
    B3 --> C1
    C1 --> D1
    D1 -->|SSH:2222 | E1
    E1 --> E2
```

## 2. 组件交互序列图

### 2.1 创建和启动 VM 流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant T as Tool (vm_create)
    participant R as ProviderRegistry
    participant P as VirtualBoxRemoteProvider
    participant S as SSHClient
    participant V as VBoxManage (远程)

    U->>T: vm_create(name="test")
    T->>R: getVMProvider()
    R-->>T: VirtualBoxRemoteProvider
    T->>P: create(config)
    P->>P: buildSSHConfig()
    P->>S: connect(host, port, key)
    S->>V: VBoxManage --version
    V-->>S: 7.0.x
    S-->>P: 连接成功
    P->>V: showvminfo "test"
    V-->>P: VM 状态信息
    P-->>T: VMInstance{id, name, status}
    T-->>U: 创建成功
```

### 2.2 执行命令流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant T as Tool (vm_exec)
    participant P as VirtualBoxRemoteProvider
    participant S as SSHClient
    participant G as GuestControl
    participant A as VM 应用

    U->>T: vm_exec(name="test", cmd="bun test")
    T->>P: exec("bun test")
    P->>P: getSSHClient(name)
    P->>S: connect()
    S->>G: VBoxManage guestcontrol "test" run<br/>--exe "/bin/bash"<br/>--username vagrant<br/>--password vagrant<br/>-- -c "bun test"
    G->>A: 执行 bun test
    A-->>G: stdout/stderr/exitCode
    G-->>S: VMExecResult
    S-->>P: {stdout, stderr, exitCode}
    P-->>T: VMExecResult
    T-->>U: 测试结果输出
```

### 2.3 测试完整流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant TR as TestRunTool
    participant TS as TestSimulateTool
    participant TC as TestCollectTool
    participant P as VirtualBoxRemoteProvider
    participant V as VM

    U->>TR: test_run(type="e2e")
    TR->>P: exec("cd /workspace && bunx playwright test")
    P->>V: 执行测试
    V-->>P: 测试结果
    P-->>TR: {exitCode, stdout, stderr}
    TR->>TR: 保存 logs/test-result.json
    TR-->>U: 测试报告

    U->>TS: test_simulate(actions=[...])
    TS->>P: exec("tmux new-session -d -s test")
    TS->>P: exec("tmux send-keys ...")
    TS->>P: exec("tmux capture-pane -p")
    P->>V: 执行 tmux 命令
    V-->>P: 终端输出
    TS->>TS: 保存 logs/simulate-result.json
    TS-->>U: 模拟结果

    U->>TC: test_collect(type="all")
    TC->>P: download("/workspace/logs/*", local)
    TC->>P: screenshot()
    TC->>P: exec("uptime && free -h")
    TC->>TC: 生成收集报告
    TC-->>U: 收集结果
```

### 2.4 快照管理流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant S as VMRemoteVBoxSnapshotTool
    participant P as VirtualBoxRemoteProvider
    participant V as VBoxManage (远程)

    U->>S: vm_snapshot(name="test", tag="backup")
    S->>P: snapshot("test", "backup", "desc")
    P->>P: getSSHClient("test")
    P->>V: VBoxManage snapshot "test" take "backup"<br/>--description "desc"
    V-->>P: 快照创建成功
    P-->>S: void
    S-->>U: 快照已创建

    Note over U,V: 恢复快照
    U->>S: vm_restore(name="test", tag="backup")
    S->>P: restore("test", "backup")
    P->>P: stop("test")
    P->>V: VBoxManage snapshot "test" restore "backup"
    V-->>P: 快照恢复成功
    P-->>S: void
    S-->>U: 快照已恢复
```

## 3. 数据流图

```mermaid
flowchart LR
    subgraph "输入"
        I1[用户指令]
        I2[工具参数]
        I3[VM 配置]
    end

    subgraph "处理"
        P1[SSH 连接建立]
        P2[VBoxManage 命令执行]
        P3[结果解析]
        P4[错误处理]
    end

    subgraph "输出"
        O1[执行结果]
        O2[日志文件]
        O3[VM 状态]
    end

    I1 --> P1
    I2 --> P2
    I3 --> P1
    P1 --> P2
    P2 --> P3
    P3 --> P4
    P4 --> O1
    P4 --> O2
    P4 --> O3
```

## 4. 状态转换图

```mermaid
stateDiagram-v2
    [*] --> Stopped: VM 创建
    Stopped --> Starting: start()
    Starting --> Running: 启动完成
    Running --> Stopping: stop()
    Running --> Poweroff: poweroff()
    Stopping --> Stopped: 正常停止
    Poweroff --> Stopped: 强制关闭
    Running --> Saved: 快照恢复
    Saved --> Running: restore() 后启动
    Stopped --> [*]: destroy()
    Running --> [*]: destroy()
```

## 5. 文件依赖关系

```mermaid
graph LR
    subgraph "工具层"
        T1[vm.ts]
        T2[vm-remote-vbox.ts]
        T3[test.ts]
    end

    subgraph "注册表"
        R1[tool/registry.ts]
        R2[vm/registry.ts]
    end

    subgraph "Provider"
        P1[virtualbox-remote-provider.ts]
    end

    subgraph "基础设施"
        S1[ssh-client.ts]
        B1[base.ts]
    end

    T1 --> R1
    T2 --> R1
    T3 --> R1
    T1 --> R2
    T2 --> P1
    T3 --> R2
    R2 --> P1
    P1 --> S1
    P1 --> B1
    S1 --> B1
```

## 6. 部署架构

```mermaid
graph TB
    subgraph "本地环境"
        L1[OpenCode 应用]
        L2[SSH Client]
    end

    subgraph "网络"
        N1[SSH:2222 或自定义端口]
    end

    subgraph "远程主机 (Vagrant/物理机)"
        R1[SSH Server]
        R2[VirtualBox]
        R3[VM 1 - Ubuntu]
        R4[VM 2 - CentOS]
    end

    L1 --> L2
    L2 --> N1
    N1 --> R1
    R1 --> R2
    R2 --> R3
    R2 --> R4
```

## 7. 安全认证流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant A as 应用配置
    participant S as SSHClient
    participant R as SSH Server

    U->>A: 配置认证信息
    A->>A: private_key_path<br/>或 password
    A->>S: connect(config)
    S->>R: SSH 握手

    alt 私钥认证
        S->>R: 发送公钥指纹
        R->>R: 验证 authorized_keys
        R-->>S: 认证成功
    else 密码认证
        S->>R: 发送密码
        R->>R: 验证密码
        R-->>S: 认证成功
    end

    S->>R: 建立加密通道
    S-->>A: 连接就绪
```

## 8. 错误处理流程

```mermaid
flowchart TD
    Start[开始执行] --> Try{执行操作}
    Try -->|成功 | Result[返回结果]
    Try -->|失败 | Catch{错误类型}

    Catch -->|SSH 连接失败 | SSHErr[返回 SSH 错误<br/>检查网络/认证]
    Catch -->|VBoxManage 失败 | VBoxErr[返回 VBox 错误<br/>检查 VM 状态]
    Catch -->|超时 | TimeoutErr[返回超时错误<br/>增加 timeout]
    Catch -->|权限错误 | PermErr[返回权限错误<br/>检查用户权限]

    SSHErr --> Handle[错误处理]
    VBoxErr --> Handle
    TimeoutErr --> Handle
    PermErr --> Handle

    Handle --> Log[记录日志]
    Log --> Notify[通知用户]
    Notify --> End[结束]
```

---

## 图例说明

| 符号 | 含义 |
|------|------|
| `->>` | 同步调用 |
| `-->>` | 返回/响应 |
| `->>` | 异步消息 |
| `[...]` | 组件/模块 |
| `(...)` | 参与者/角色 |
| `{...}` | 条件判断 |
| `[...]` | 注释说明 |
