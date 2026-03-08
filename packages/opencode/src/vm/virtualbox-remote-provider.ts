/**
 * VirtualBox Remote 提供者
 *
 * 通过 SSH 管理 VirtualBox VM
 * - 本地：连接到 127.0.0.1:2222
 * - 远程：连接到远程主机的 SSH 端口
 */

import type { VMInstance, VMStatus, VMConfig, VMExecResult } from "./base";
import { VMProviderBase } from "./base";
import type { SSHConfig } from "./ssh-client";
import { SSHClient } from "./ssh-client";
import { Log } from "@/util/log";

const log = Log.create({ service: "vm.vbox-remote" });

export interface VirtualBoxRemoteConfig extends VMConfig {
  /** 远程主机 IP 或域名 (本地连接时留空) */
  remote_host?: string;
  /** SSH 端口 (默认：2222) */
  ssh_port?: number;
  /** SSH 用户名 (默认：vagrant) */
  ssh_username?: string;
  /** 私钥路径 (推荐) 或密码 */
  private_key_path?: string;
  private_key?: string;
  password?: string;
}

interface VMInstanceData {
  name: string;
  config: VirtualBoxRemoteConfig;
  status: VMStatus;
}

export class VirtualBoxRemoteProvider extends VMProviderBase {
  private instances: Map<string, VMInstanceData> = new Map();
  private defaultHost = "127.0.0.1";
  private defaultPort = 2222;
  private defaultUsername = "vagrant";

  /**
   * 构建 SSH 配置
   */
  private buildSSHConfig(config: VirtualBoxRemoteConfig): SSHConfig {
    const sshConfig: SSHConfig = {
      host: config.remote_host || this.defaultHost,
      port: config.ssh_port || this.defaultPort,
      username: config.ssh_username || this.defaultUsername,
      readyTimeout: 30000,
    };

    if (config.private_key) {
      sshConfig.privateKey = config.private_key;
    } else if (config.private_key_path) {
      sshConfig.privateKeyPath = config.private_key_path;
    } else if (config.password) {
      sshConfig.password = config.password;
    }

    return sshConfig;
  }

  /**
   * 创建/注册虚拟机
   */
  async create(config: VirtualBoxRemoteConfig): Promise<VMInstance> {
    const { name } = config;

    log.info(`创建 VM: ${name} @ ${config.remote_host || "127.0.0.1"}:${config.ssh_port || this.defaultPort}`);

    // 验证 SSH 连接和 VirtualBox
    await this.testConnection(config);

    // 获取 VM 状态
    const status = await this.getVMStatus(config, name);

    const instance: VMInstance = {
      id: `vbox-remote-${name}-${Date.now()}`,
      name,
      status: status || "stopped",
      ip: config.remote_host || this.defaultHost,
      provider: "remote-ssh",
      capabilities: {
        snapshot: true,
        screenshot: false,
        gui: false,
        headless: true,
      },
    };

    this.instances.set(name, { name, config, status: status || "stopped" });
    return instance;
  }

  /**
   * 测试 SSH 连接并验证 VirtualBox
   */
  private async testConnection(config: VirtualBoxRemoteConfig): Promise<void> {
    const client = new SSHClient(this.buildSSHConfig(config));
    try {
      await client.connect();
      const result = await client.exec("VBoxManage --version");
      if (result.code !== 0) {
        throw new Error(`VirtualBox 未安装：${result.stderr}`);
      }
      log.info(`VirtualBox 版本：${result.stdout.trim()}`);
    } finally {
      client.close();
    }
  }

  /**
   * 获取 VM 状态
   */
  private async getVMStatus(config: VirtualBoxRemoteConfig, name: string): Promise<VMStatus | null> {
    const client = new SSHClient(this.buildSSHConfig(config));
    try {
      await client.connect();
      const result = await client.exec(`VBoxManage showvminfo "${name}" --machinereadable`);

      if (result.code !== 0) return null;

      const stateMatch = result.stdout.match(/vmState="([^"]+)"/);
      if (stateMatch) {
        const state = stateMatch[1];
        if (state === "running") return "running";
        if (state === "powered off") return "stopped";
        if (state === "saved") return "saved";
        if (state === "paused") return "paused";
      }
      return "stopped";
    } catch {
      return null;
    } finally {
      client.close();
    }
  }

  /**
   * 获取 SSH 客户端
   */
  private async getSSHClient(name: string): Promise<SSHClient> {
    const instanceData = this.instances.get(name);
    if (!instanceData) {
      throw new Error(`VM "${name}" 不存在，请先创建`);
    }
    return new SSHClient(this.buildSSHConfig(instanceData.config));
  }

  /**
   * 执行 VBoxManage 命令
   */
  private async execVBoxManage(name: string, command: string): Promise<VMExecResult> {
    const client = await this.getSSHClient(name);
    try {
      await client.connect();
      const result = await client.exec(`VBoxManage ${command}`);
      return { stdout: result.stdout, stderr: result.stderr, exitCode: result.code };
    } finally {
      client.close();
    }
  }

  async start(name: string, headless = true): Promise<void> {
    const instanceData = this.instances.get(name);
    if (!instanceData) throw new Error(`VM "${name}" 不存在`);

    const mode = headless ? "headless" : "gui";
    const result = await this.execVBoxManage(name, `startvm "${name}" --type ${mode}`);

    if (result.exitCode !== 0 && !result.stdout.includes("already running")) {
      throw new Error(`启动 VM 失败：${result.stderr}`);
    }

    instanceData.status = "running";
  }

  async stop(name: string): Promise<void> {
    const result = await this.execVBoxManage(name, `controlvm "${name}" acpipowerbutton`);
    if (result.exitCode !== 0) throw new Error(`停止 VM 失败：${result.stderr}`);
    const instanceData = this.instances.get(name);
    if (instanceData) instanceData.status = "stopped";
  }

  async poweroff(name: string): Promise<void> {
    const result = await this.execVBoxManage(name, `controlvm "${name}" poweroff`);
    if (result.exitCode !== 0) throw new Error(`强制关闭 VM 失败：${result.stderr}`);
    const instanceData = this.instances.get(name);
    if (instanceData) instanceData.status = "stopped";
  }

  async destroy(name: string): Promise<void> {
    try {
      const status = await this.getStatus(name);
      if (status === "running") await this.poweroff(name);
    } catch {}

    const result = await this.execVBoxManage(name, `unregistervm "${name}" --delete`);
    if (result.exitCode !== 0) throw new Error(`删除 VM 失败：${result.stderr}`);

    this.instances.delete(name);
  }

  async snapshot(name: string, tag: string, description?: string): Promise<void> {
    const desc = description || `Snapshot: ${tag}`;
    const result = await this.execVBoxManage(name, `snapshot "${name}" take "${tag}" --description "${desc}"`);
    if (result.exitCode !== 0) throw new Error(`创建快照失败：${result.stderr}`);
  }

  async restore(name: string, tag: string): Promise<void> {
    try { await this.stop(name); } catch {}
    const result = await this.execVBoxManage(name, `snapshot "${name}" restore "${tag}"`);
    if (result.exitCode !== 0) throw new Error(`恢复快照失败：${result.stderr}`);
    const instanceData = this.instances.get(name);
    if (instanceData) instanceData.status = "saved";
  }

  async deleteSnapshot(name: string, tag: string): Promise<void> {
    const result = await this.execVBoxManage(name, `snapshot "${name}" delete "${tag}"`);
    if (result.exitCode !== 0) throw new Error(`删除快照失败：${result.stderr}`);
  }

  async getIP(name: string): Promise<string> {
    const instanceData = this.instances.get(name);
    if (!instanceData) throw new Error(`VM "${name}" 不存在`);
    return instanceData.config.remote_host || this.defaultHost;
  }

  async getSSHPort(name: string): Promise<number> {
    const instanceData = this.instances.get(name);
    if (!instanceData) throw new Error(`VM "${name}" 不存在`);
    return instanceData.config.ssh_port || this.defaultPort;
  }

  async exec(name: string, cmd: string): Promise<VMExecResult> {
    // 通过 VBoxManage guestcontrol 执行
    const result = await this.execVBoxManage(
      name,
      `guestcontrol "${name}" run --exe "/bin/bash" --username vagrant --password vagrant --stdout --stderr -- -c "${cmd.replace(/"/g, '\\"')}"`,
    );
    return result;
  }

  async upload(name: string, localPath: string, remotePath: string): Promise<void> {
    const result = await this.execVBoxManage(
      name,
      `guestcontrol "${name}" copyto "${localPath}" "${remotePath}" --username vagrant --password vagrant`,
    );
    if (result.exitCode !== 0) throw new Error(`上传文件失败：${result.stderr}`);
  }

  async download(name: string, remotePath: string, localPath: string): Promise<void> {
    const result = await this.execVBoxManage(
      name,
      `guestcontrol "${name}" copyfrom "${remotePath}" "${localPath}" --username vagrant --password vagrant`,
    );
    if (result.exitCode !== 0) throw new Error(`下载文件失败：${result.stderr}`);
  }

  async screenshot(): Promise<string> {
    throw new Error("远程 SSH 模式不支持截图");
  }

  async getStatus(name: string): Promise<VMStatus> {
    const instanceData = this.instances.get(name);
    if (!instanceData) throw new Error(`VM "${name}" 不存在`);

    const status = await this.getVMStatus(instanceData.config, name);
    if (status) {
      instanceData.status = status;
      return status;
    }
    return "stopped";
  }

  async list(): Promise<VMInstance[]> {
    const result: VMInstance[] = [];
    const client = await this.getSSHClient("default");
    try {
      await client.connect();
      const listResult = await client.exec("VBoxManage list vms");
      if (listResult.code === 0) {
        const lines = listResult.stdout.trim().split("\n").filter(Boolean);
        for (const line of lines) {
          const match = line.match(/"([^"]+)" \{([^}]+)\}/);
          if (match) {
            const vmName = match[1];
            const status = await this.getStatus(vmName);
            result.push({
              id: `vbox-remote-${vmName}`,
              name: vmName,
              status,
              provider: "remote-ssh",
              capabilities: { snapshot: true, screenshot: false, gui: false, headless: true },
            });
          }
        }
      }
    } catch (err) {
      log.error(`获取 VM 列表失败：${err}`);
    } finally {
      client.close();
    }
    return result;
  }

  async isAvailable(): Promise<boolean> {
    const client = new SSHClient(this.buildSSHConfig({ name: "default" }));
    try {
      await client.connect();
      const result = await client.exec("VBoxManage --version");
      return result.code === 0;
    } catch {
      return false;
    } finally {
      client.close();
    }
  }
}
