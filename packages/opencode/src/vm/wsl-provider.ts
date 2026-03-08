/**
 * WSL 提供者 (Windows Subsystem for Linux)
 *
 * 仅适用于 Windows 平台
 * 不支持快照和截图，但轻量且集成度高
 */

import { VMProviderBase } from "./base";
import type { VMConfig, VMInstance, VMStatus, VMExecResult } from "./base";
import { exec } from "child_process";
import { promisify } from "util";
import { Log } from "@/util/log";

const execAsync = promisify(exec);
const log = Log.create({ service: "vm.wsl" });

export interface WSLVM extends VMInstance {
  provider: "wsl";
  distribution: string;
}

export class WSLProvider extends VMProviderBase {
  private vms: Map<string, WSLVM> = new Map();

  /**
   * 检查 WSL 是否可用
   */
  async isAvailable(): Promise<boolean> {
    if (process.platform !== "win32") {
      return false;
    }

    try {
      await execAsync("wsl --version");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 安装/注册 WSL 发行版
   */
  async create(config: VMConfig): Promise<WSLVM> {
    const { name, os } = config;
    const distribution = name; // WSL 中名称即发行版名

    log.info(`创建 WSL 发行版：${distribution}`);

    try {
      // 检查是否已安装
      const installed = await this.isInstalled(distribution);
      if (installed) {
        log.info(`发行版 "${distribution}" 已存在`);
      } else {
        // 安装发行版
        const osVersion = this.mapOSVersion(os);
        await execAsync(`wsl --install -d ${distribution} --no-launch`);

        // 对于非标准发行版，可能需要导入
        log.info(`发行版 "${distribution}" 已安装`);
      }

      const vm: WSLVM = {
        id: distribution,
        name: distribution,
        status: "running",
        provider: "wsl",
        distribution,
        capabilities: {
          snapshot: false,
          screenshot: false,
          gui: false,
          headless: true,
        },
      };

      this.vms.set(distribution, vm);
      return vm;
    } catch (error: any) {
      log.error(`创建 WSL 发行版失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 启动 WSL (实际上是确保它可用)
   */
  async start(): Promise<void> {
    log.info(`启动 WSL`);
    // WSL 按需启动，不需要显式启动
    // 执行一个简单命令来触发启动
    try {
      await execAsync("wsl -- ls /");
    } catch (error: any) {
      log.error(`WSL 启动失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 停止 WSL 发行版
   */
  async stop(name: string): Promise<void> {
    log.info(`停止 WSL 发行版：${name}`);

    try {
      await execAsync(`wsl --terminate ${name}`);
      log.info(`WSL 发行版 "${name}" 已停止`);
    } catch (error: any) {
      log.error(`停止 WSL 发行版失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 强制关闭 WSL
   */
  async poweroff(): Promise<void> {
    log.info(`强制关闭 WSL`);

    try {
      await execAsync("wsl --shutdown");
      log.info("WSL 已完全关闭");
    } catch (error: any) {
      log.error(`强制关闭 WSL 失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 删除 WSL 发行版
   */
  async destroy(name: string): Promise<void> {
    log.info(`删除 WSL 发行版：${name}`);

    try {
      // 先停止
      try {
        await this.stop(name);
      } catch {
        // 忽略
      }

      // 注销发行版
      await execAsync(`wsl --unregister ${name}`);
      this.vms.delete(name);
      log.info(`WSL 发行版 "${name}" 已删除`);
    } catch (error: any) {
      log.error(`删除 WSL 发行版失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 创建快照 (不支持)
   */
  async snapshot(): Promise<void> {
    throw new Error("WSL provider 不支持快照功能");
  }

  /**
   * 恢复快照 (不支持)
   */
  async restore(): Promise<void> {
    throw new Error("WSL provider 不支持快照恢复功能");
  }

  /**
   * 删除快照 (不支持)
   */
  async deleteSnapshot(): Promise<void> {
    throw new Error("WSL provider 不支持快照功能");
  }

  /**
   * 获取 IP 地址 (WSL 使用 localhost)
   */
  async getIP(): Promise<string> {
    return "localhost";
  }

  /**
   * 获取 SSH 端口 (WSL 不使用 SSH)
   */
  async getSSHPort(): Promise<number> {
    return 0;
  }

  /**
   * 执行命令 (使用 wsl 命令)
   */
  async exec(name: string, cmd: string): Promise<VMExecResult> {
    log.debug(`执行命令：${cmd}`);

    try {
      const { stdout, stderr } = await execAsync(
        `wsl -d ${name} /bin/bash -c "${cmd.replace(/"/g, '\\"')}"`,
      );

      return {
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error: any) {
      return {
        stdout: error.stdout || "",
        stderr: error.stderr || error.message,
        exitCode: error.status || 1,
      };
    }
  }

  /**
   * 上传文件 (使用 wsl 路径)
   */
  async upload(name: string, localPath: string, remotePath: string): Promise<void> {
    log.info(`上传文件：${localPath} -> ${remotePath}`);

    try {
      // 使用 wslpath 转换路径
      const { execSync } = require("child_process");
      const wslPath = execSync(`wsl -d ${name} wslpath '${remotePath}'`).toString().trim();

      // 复制文件
      await execAsync(`wsl -d ${name} cp '${localPath}' '${wslPath}'`);
      log.info("文件上传完成");
    } catch (error: any) {
      log.error(`上传文件失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 下载文件 (使用 wsl 路径)
   */
  async download(name: string, remotePath: string, localPath: string): Promise<void> {
    log.info(`下载文件：${remotePath} -> ${localPath}`);

    try {
      // 使用 wslpath 转换路径
      const { execSync } = require("child_process");
      const wslPath = execSync(`wsl -d ${name} wslpath '${remotePath}'`).toString().trim();

      // 复制文件
      await execAsync(`wsl -d ${name} cp '${wslPath}' '${localPath}'`);
      log.info("文件下载完成");
    } catch (error: any) {
      log.error(`下载文件失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 截图 (不支持)
   */
  async screenshot(): Promise<string> {
    throw new Error("WSL provider 不支持截图功能");
  }

  /**
   * 获取状态 (WSL 始终视为 running)
   */
  async getStatus(name: string): Promise<VMStatus> {
    try {
      // 检查发行版是否安装
      const installed = await this.isInstalled(name);
      if (!installed) {
        return "stopped";
      }

      // WSL 没有真正的停止状态，按需启动
      return "running";
    } catch {
      return "stopped";
    }
  }

  /**
   * 列出所有 WSL 发行版
   */
  async list(): Promise<VMInstance[]> {
    try {
      const { stdout } = await execAsync("wsl --list --quiet");
      const names = stdout.trim().split("\n").filter(Boolean);

      const vms: VMInstance[] = [];
      for (const name of names) {
        const status = await this.getStatus(name);
        vms.push({
          id: name,
          name,
          status,
          provider: "wsl",
          capabilities: {
            snapshot: false,
            screenshot: false,
            gui: false,
            headless: true,
          },
        });
      }

      return vms;
    } catch {
      return [];
    }
  }

  // ===== 辅助方法 =====

  /**
   * 检查发行版是否已安装
   */
  private async isInstalled(name: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync("wsl --list --quiet");
      const installed = stdout.trim().split("\n").map(s => s.trim());
      return installed.includes(name);
    } catch {
      return false;
    }
  }

  /**
   * 映射操作系统版本
   */
  private mapOSVersion(os: string): string {
    const mapping: Record<string, string> = {
      "ubuntu-22.04": "Ubuntu-22.04",
      "ubuntu-24.04": "Ubuntu-24.04",
      "ubuntu-20.04": "Ubuntu-20.04",
      "ubuntu": "Ubuntu-22.04",
      "debian-12": "Debian",
      "debian": "Debian",
      "opensuse": "openSUSE-15",
      "sles": "SLES-15",
    };

    return mapping[os] || "Ubuntu-22.04";
  }

  /**
   * 延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
