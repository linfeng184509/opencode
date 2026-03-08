/**
 * VirtualBox 远程连接提供者
 *
 * 连接到远程 VirtualBox 主机并管理虚拟机
 */

import type { VMInstance, VMStatus, VMConfig, VMExecResult } from "./base";
import { VMProviderBase } from "./base";
import type { SSHConfig } from "./ssh-client";
import { SSHClient } from "./ssh-client";
import { Log } from "@/util/log";
import { mkdir } from "fs/promises";
import { dirname } from "path";

const log = Log.create({ service: "vm.virtualbox-remote" });

export interface VirtualBoxRemoteConfig extends VMConfig {
  /** 远程 VirtualBox 主机 IP 或域名 */
  remote_host: string;
  /** 远程 SSH 端口 (默认 22) */
  remote_ssh_port?: number;
  /** 远程 SSH 用户名 */
  remote_username: string;
  /** 认证类型 */
  auth_type: "password" | "key";
  /** 密码 */
  password?: string;
  /** 私钥内容 */
  private_key?: string;
  /** 私钥文件路径 */
  private_key_path?: string;
}

export class VirtualBoxRemoteProvider extends VMProviderBase {
  private instances: Map<string, { name: string; config: VirtualBoxRemoteConfig; status: VMStatus }> = new Map();
  private clients: Map<string, SSHClient> = new Map();

  /**
   * 连接远程 VirtualBox 主机
   */
  async create(config: VirtualBoxRemoteConfig): Promise<VMInstance> {
    const { name, remote_host, remote_ssh_port = 22, remote_username } = config;

    log.info(`连接远程 VirtualBox: ${name} @ ${remote_host}:${remote_ssh_port}`);

    // 验证连接并检查 VirtualBox 是否可用
    await this.testConnection(config);

    // 获取 VM 信息
    const vmInfo = await this.getVMInfo(config, name);

    const instance: VMInstance = {
      id: `vbox-remote-${name}-${Date.now()}`,
      name,
      status: vmInfo.status,
      ip: remote_host,
      provider: "remote-ssh",
      capabilities: {
        snapshot: true,
        screenshot: false,
        gui: false,
        headless: true,
      },
    };

    this.instances.set(name, { name, config, status: vmInfo.status });
    return instance;
  }

  /**
   * 测试 SSH 连接并验证 VirtualBox
   */
  private async testConnection(config: VirtualBoxRemoteConfig): Promise<void> {
    const sshConfig: SSHConfig = {
      host: config.remote_host,
      port: config.remote_ssh_port || 22,
      username: config.remote_username,
      password: config.password,
      privateKey: config.private_key,
      privateKeyPath: config.private_key_path,
      readyTimeout: 30000,
    };

    const client = new SSHClient(sshConfig);
    try {
      await client.connect();
      // 检查 VirtualBox 是否可用
      const vboxCheck = await client.exec("VBoxManage --version");
      if (vboxCheck.code !== 0) {
        throw new Error(`远程主机未安装 VirtualBox: ${vboxCheck.stderr}`);
      }
      log.info(`VirtualBox 版本：${vboxCheck.stdout.trim()}`);
    } finally {
      client.close();
    }
  }

  /**
   * 获取 VM 状态信息
   */
  private async getVMInfo(
    config: VirtualBoxRemoteConfig,
    name: string,
  ): Promise<{ status: VMStatus; ip?: string }> {
    const sshConfig: SSHConfig = {
      host: config.remote_host,
      port: config.remote_ssh_port || 22,
      username: config.remote_username,
      password: config.password,
      privateKey: config.private_key,
      privateKeyPath: config.private_key_path,
      readyTimeout: 30000,
    };

    const client = new SSHClient(sshConfig);
    try {
      await client.connect();

      // 获取 VM 信息
      const result = await client.exec(`VBoxManage showvminfo "${name}" --machinereadable`);

      if (result.code !== 0) {
        throw new Error(`VM "${name}" 不存在：${result.stderr}`);
      }

      // 解析输出
      const output = result.stdout;
      let status: VMStatus = "stopped";
      let ip: string | undefined;

      // 解析 vmState 行
      const stateMatch = output.match(/vmState="([^"]+)"/);
      if (stateMatch) {
        const state = stateMatch[1];
        if (state === "running") status = "running";
        else if (state === "powered off") status = "stopped";
        else if (state === "saved") status = "saved";
        else if (state === "paused") status = "paused";
      }

      // 如果有网络适配器，获取 IP
      // 这通常需要 Guest Additions 支持
      const guestIPMatch = output.match(/\/VirtualBox\/GuestAdd\/1\.0\/misc\/guestip="([^"]+)"/);
      if (guestIPMatch) {
        ip = guestIPMatch[1];
      }

      return { status, ip };
    } finally {
      client.close();
    }
  }

  /**
   * 获取 SSH 客户端
   */
  private async getClient(name: string): Promise<SSHClient> {
    if (this.clients.has(name)) {
      return this.clients.get(name)!;
    }

    const instanceData = this.instances.get(name);
    if (!instanceData) {
      throw new Error(`VM "${name}" 不存在，请先连接`);
    }

    const config = instanceData.config;
    const sshConfig: SSHConfig = {
      host: config.remote_host,
      port: config.remote_ssh_port || 22,
      username: config.remote_username,
      password: config.password,
      privateKey: config.private_key,
      privateKeyPath: config.private_key_path,
      readyTimeout: 30000,
    };

    const client = new SSHClient(sshConfig);
    await client.connect();
    this.clients.set(name, client);
    return client;
  }

  /**
   * 在远程 VirtualBox 主机执行 VBoxManage 命令
   */
  private async execVBoxManage(name: string, command: string): Promise<VMExecResult> {
    const sshConfig: SSHConfig = {
      host: this.instances.get(name)?.config.remote_host || "",
      port: this.instances.get(name)?.config.remote_ssh_port || 22,
      username: this.instances.get(name)?.config.remote_username || "",
      password: this.instances.get(name)?.config.password,
      privateKey: this.instances.get(name)?.config.private_key,
      privateKeyPath: this.instances.get(name)?.config.private_key_path,
      readyTimeout: 30000,
    };

    const client = new SSHClient(sshConfig);
    try {
      await client.connect();
      const result = await client.exec(`VBoxManage ${command}`);
      // SSHExecResult 使用 code，VMExecResult 使用 exitCode，需要转换
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
      };
    } finally {
      client.close();
    }
  }

  /**
   * 启动 VM
   */
  async start(name: string, headless?: boolean): Promise<void> {
    const instanceData = this.instances.get(name);
    if (!instanceData) {
      throw new Error(`VM "${name}" 不存在`);
    }

    const mode = headless ? "headless" : "gui";
    const result = await this.execVBoxManage(name, `startvm "${name}" --type ${mode}`);

    if (result.exitCode !== 0 && !result.stdout.includes("already running")) {
      throw new Error(`启动 VM 失败：${result.stderr}`);
    }

    instanceData.status = "running";
    log.info(`远程 VM 已启动：${name}`);
  }

  /**
   * 停止 VM
   */
  async stop(name: string): Promise<void> {
    const result = await this.execVBoxManage(name, `controlvm "${name}" acpipowerbutton`);
    if (result.exitCode !== 0) {
      throw new Error(`停止 VM 失败：${result.stderr}`);
    }

    const instanceData = this.instances.get(name);
    if (instanceData) {
      instanceData.status = "stopped";
    }
    log.info(`远程 VM 已停止：${name}`);
  }

  /**
   * 强制关闭 VM
   */
  async poweroff(name: string): Promise<void> {
    const result = await this.execVBoxManage(name, `controlvm "${name}" poweroff`);
    if (result.exitCode !== 0) {
      throw new Error(`强制关闭 VM 失败：${result.stderr}`);
    }

    const instanceData = this.instances.get(name);
    if (instanceData) {
      instanceData.status = "stopped";
    }
    log.info(`远程 VM 已强制关闭：${name}`);
  }

  /**
   * 删除 VM
   */
  async destroy(name: string): Promise<void> {
    const result = await this.execVBoxManage(name, `unregistervm "${name}" --delete`);
    if (result.exitCode !== 0) {
      throw new Error(`删除 VM 失败：${result.stderr}`);
    }

    this.instances.delete(name);
    log.info(`远程 VM 已删除：${name}`);
  }

  /**
   * 创建快照
   */
  async snapshot(name: string, tag: string, description?: string): Promise<void> {
    const desc = description || `Snapshot: ${tag}`;
    const result = await this.execVBoxManage(name, `snapshot "${name}" take "${tag}" --description "${desc}"`);
    if (result.exitCode !== 0) {
      throw new Error(`创建快照失败：${result.stderr}`);
    }
    log.info(`快照已创建：${tag}`);
  }

  /**
   * 恢复快照
   */
  async restore(name: string, tag: string): Promise<void> {
    // 先停止 VM
    try {
      await this.stop(name);
    } catch {
      // 忽略，可能已经停止
    }

    const result = await this.execVBoxManage(name, `snapshot "${name}" restore "${tag}"`);
    if (result.exitCode !== 0) {
      throw new Error(`恢复快照失败：${result.stderr}`);
    }

    const instanceData = this.instances.get(name);
    if (instanceData) {
      instanceData.status = "saved";
    }
    log.info(`快照已恢复：${tag}`);
  }

  /**
   * 删除快照
   */
  async deleteSnapshot(name: string, tag: string): Promise<void> {
    const result = await this.execVBoxManage(name, `snapshot "${name}" delete "${tag}"`);
    if (result.exitCode !== 0) {
      throw new Error(`删除快照失败：${result.stderr}`);
    }
    log.info(`快照已删除：${tag}`);
  }

  /**
   * 获取 IP 地址
   */
  async getIP(name: string): Promise<string> {
    const instanceData = this.instances.get(name);
    if (!instanceData) {
      throw new Error(`VM "${name}" 不存在`);
    }
    return instanceData.config.remote_host;
  }

  /**
   * 获取 SSH 端口
   */
  async getSSHPort(name: string): Promise<number> {
    const instanceData = this.instances.get(name);
    if (!instanceData) {
      throw new Error(`VM "${name}" 不存在`);
    }
    return instanceData.config.remote_ssh_port || 22;
  }

  /**
   * 执行命令 (在 VM 内部，通过 SSH)
   * 注意：这需要 VM 内部也运行 SSH 服务器
   */
  async exec(name: string, cmd: string): Promise<VMExecResult> {
    // 这里假设 VM 内部运行 SSH 服务器
    // 实际使用中可能需要配置端口转发
    const instanceData = this.instances.get(name);
    if (!instanceData) {
      throw new Error(`VM "${name}" 不存在`);
    }

    // 尝试通过 SSH 连接到 VM 内部
    // 这通常需要端口转发配置
    log.warn(`VM 内部命令执行需要配置端口转发，当前仅支持在 VirtualBox 主机上执行命令`);

    // 在 VirtualBox 主机上执行，然后通过 VBoxManage guestcontrol 执行
    const result = await this.execVBoxManage(
      name,
      `guestcontrol "${name}" run --exe "/bin/sh" --username guest --password guest --stdout --stderr -- ${cmd}`,
    );

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  /**
   * 上传文件到 VM
   */
  async upload(name: string, localPath: string, remotePath: string): Promise<void> {
    // 使用 VBoxManage guestcontrol 上传
    const sshConfig: SSHConfig = {
      host: this.instances.get(name)?.config.remote_host || "",
      port: this.instances.get(name)?.config.remote_ssh_port || 22,
      username: this.instances.get(name)?.config.remote_username || "",
      password: this.instances.get(name)?.config.password,
      privateKey: this.instances.get(name)?.config.private_key,
      privateKeyPath: this.instances.get(name)?.config.private_key_path,
      readyTimeout: 30000,
    };

    const client = new SSHClient(sshConfig);
    try {
      await client.connect();
      // 先上传到远程主机
      const tempPath = `/tmp/${localPath.split("/").pop() || "upload"}`;
      await client.upload(localPath, tempPath);

      // 然后通过 guestcontrol 复制到 VM
      const result = await client.exec(
        `VBoxManage guestcontrol "${name}" copyto "${tempPath}" "${remotePath}" --username guest --password guest`,
      );

      if (result.code !== 0) {
        throw new Error(`上传文件失败：${result.stderr}`);
      }

      // 清理临时文件
      await client.exec(`rm -f ${tempPath}`);

      log.info(`文件已上传：${localPath} -> ${name}:${remotePath}`);
    } finally {
      client.close();
    }
  }

  /**
   * 从 VM 下载文件
   */
  async download(name: string, remotePath: string, localPath: string): Promise<void> {
    const sshConfig: SSHConfig = {
      host: this.instances.get(name)?.config.remote_host || "",
      port: this.instances.get(name)?.config.remote_ssh_port || 22,
      username: this.instances.get(name)?.config.remote_username || "",
      password: this.instances.get(name)?.config.password,
      privateKey: this.instances.get(name)?.config.private_key,
      privateKeyPath: this.instances.get(name)?.config.private_key_path,
      readyTimeout: 30000,
    };

    const client = new SSHClient(sshConfig);
    try {
      await client.connect();

      // 通过 guestcontrol 从 VM 复制到远程主机
      const tempPath = `/tmp/${remotePath.split("/").pop() || "download"}`;
      const result = await client.exec(
        `VBoxManage guestcontrol "${name}" copyfrom "${remotePath}" "${tempPath}" --username guest --password guest`,
      );

      if (result.code !== 0) {
        throw new Error(`下载文件失败：${result.stderr}`);
      }

      // 从远程主机下载到本地
      await mkdir(dirname(localPath), { recursive: true });
      await client.download(tempPath, localPath);

      // 清理临时文件
      await client.exec(`rm -f ${tempPath}`);

      log.info(`文件已下载：${name}:${remotePath} -> ${localPath}`);
    } finally {
      client.close();
    }
  }

  /**
   * 截图 (不支持)
   */
  async screenshot(_name: string, _outputPath: string): Promise<string> {
    throw new Error("远程 VirtualBox VM 不支持截图功能");
  }

  /**
   * 获取 VM 状态
   */
  async getStatus(name: string): Promise<VMStatus> {
    const instanceData = this.instances.get(name);
    if (!instanceData) {
      throw new Error(`VM "${name}" 不存在`);
    }

    const vmInfo = await this.getVMInfo(instanceData.config, name);
    instanceData.status = vmInfo.status;
    return vmInfo.status;
  }

  /**
   * 列出所有 VM
   */
  async list(): Promise<VMInstance[]> {
    const result: VMInstance[] = [];

    for (const [name, data] of this.instances.entries()) {
      result.push({
        id: `vbox-remote-${name}`,
        name: data.name,
        status: data.status,
        ip: data.config.remote_host,
        provider: "remote-ssh",
        capabilities: {
          snapshot: true,
          screenshot: false,
          gui: false,
          headless: true,
        },
      });
    }
    return result;
  }

  /**
   * 检查提供者是否可用
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }
}
