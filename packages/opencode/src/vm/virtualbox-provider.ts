/**
 * VirtualBox VM 提供者
 *
 * 跨平台支持：Windows / macOS / Linux
 * 需要安装 VirtualBox: https://www.virtualbox.org
 */

import { VMProviderBase } from "./base";
import type { VMConfig, VMInstance, VMStatus, VMExecResult } from "./base";
import { SSHClient } from "./ssh-client";
import { exec } from "child_process";
import { promisify } from "util";
import { Log } from "@/util/log";

const execAsync = promisify(exec);
const log = Log.create({ service: "vm.virtualbox" });

export interface VirtualBoxVM extends VMInstance {
  provider: "vbox";
  sshPort: number;
  vdiPath?: string;
}

export class VirtualBoxProvider extends VMProviderBase {
  private vms: Map<string, VirtualBoxVM> = new Map();

  constructor() {
    super();
  }

  /**
   * 检查 VirtualBox 是否已安装
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execAsync("VBoxManage --version");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 创建虚拟机
   */
  async create(config: VMConfig): Promise<VirtualBoxVM> {
    const { name, os, cpu = 2, memory = "4096", disk = "20G", iso } = config;
    const sshPort = config.ssh_port || 2222;
    const osType = this.mapOSType(os);

    log.info(`创建 VM: ${name}`, { os, cpu, memory, disk });

    try {
      // 1. 检查 VM 是否已存在
      try {
        await execAsync(`VBoxManage showvminfo "${name}"`);
        throw new Error(`虚拟机 "${name}" 已存在`);
      } catch (err: any) {
        if (!err.message.includes("could not find a registered machine")) {
          throw err;
        }
      }

      // 2. 创建 VM
      await execAsync(`VBoxManage createvm --name "${name}" --register`);
      log.debug(`VM "${name}" 已创建`);

      // 3. 配置硬件
      await execAsync(`VBoxManage modifyvm "${name}" --memory ${memory}`);
      await execAsync(`VBoxManage modifyvm "${name}" --cpus ${cpu}`);
      await execAsync(`VBoxManage modifyvm "${name}" --ostype "${osType}"`);

      // 4. 配置网络 (NAT + 端口转发 SSH)
      await execAsync(`VBoxManage modifyvm "${name}" --nic1 nat`);
      await execAsync(
        `VBoxManage modifyvm "${name}" --natpf1 "ssh,tcp,,${sshPort},,22"`,
      );
      log.debug(`网络配置完成，SSH 端口：${sshPort}`);

      // 5. 配置存储控制器
      await execAsync(`VBoxManage storagectl "${name}" --name "SATA Controller" --add sata`);

      // 6. 创建虚拟磁盘
      const vdiPath = `${name}.vdi`;
      await execAsync(`VBoxManage createmedium disk --filename "${vdiPath}" --sizegb ${parseInt(disk)}`);
      await execAsync(
        `VBoxManage storageattach "${name}" --storagectl "SATA Controller" --port 0 --type hdd --medium "${vdiPath}"`,
      );
      log.debug(`磁盘创建完成：${vdiPath}`);

      // 7. 配置光驱 (用于安装 ISO)
      if (iso) {
        await execAsync(
          `VBoxManage storageattach "${name}" --storagectl "SATA Controller" --port 1 --type dvddrive --medium "${iso}"`,
        );
      }

      // 8. 配置 USB (可选，增强兼容性)
      await execAsync(`VBoxManage modifyvm "${name}" --usb on`);
      await execAsync(`VBoxManage modifyvm "${name}" --usbehci on`);

      // 9. 配置音频 (可选)
      await execAsync(`VBoxManage modifyvm "${name}" --audio none`);

      // 10. 启用嵌套虚拟化 (可选，用于运行 VM 内的 VM)
      try {
        await execAsync(`VBoxManage modifyvm "${name}" --nested-hw-virtex on`);
      } catch {
        log.debug("嵌套虚拟化不支持，跳过");
      }

      const vm: VirtualBoxVM = {
        id: name,
        name,
        status: "stopped",
        provider: "vbox",
        sshPort,
        vdiPath,
        capabilities: {
          snapshot: true,
          screenshot: true,
          gui: true,
          headless: true,
        },
      };

      this.vms.set(name, vm);
      log.info(`VM "${name}" 创建完成`);

      return vm;
    } catch (error: any) {
      log.error(`创建 VM 失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 启动虚拟机
   */
  async start(name: string, headless = true): Promise<void> {
    log.info(`启动 VM: ${name} (${headless ? "headless" : "gui"})`);

    try {
      const mode = headless ? "headless" : "gui";
      await execAsync(`VBoxManage startvm "${name}" --type ${mode}`);

      // 等待 VM 完全启动并可 SSH 连接
      await this.waitForSSH(name);
      log.info(`VM "${name}" 已启动`);
    } catch (error: any) {
      log.error(`启动 VM 失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 停止虚拟机 (ACPI 软关机)
   */
  async stop(name: string): Promise<void> {
    log.info(`停止 VM: ${name}`);

    try {
      await execAsync(`VBoxManage controlvm "${name}" acpipowerbutton`);
      await this.waitForStatus(name, "poweroff");
      log.info(`VM "${name}" 已停止`);
    } catch (error: any) {
      log.error(`停止 VM 失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 强制关闭虚拟机
   */
  async poweroff(name: string): Promise<void> {
    log.info(`强制关闭 VM: ${name}`);

    try {
      await execAsync(`VBoxManage controlvm "${name}" poweroff`);
      await this.waitForStatus(name, "poweroff");
      log.info(`VM "${name}" 已强制关闭`);
    } catch (error: any) {
      log.error(`强制关闭 VM 失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 删除虚拟机
   */
  async destroy(name: string): Promise<void> {
    log.info(`删除 VM: ${name}`);

    try {
      // 先停止
      try {
        const status = await this.getStatus(name);
        if (status === "running" || status === "paused") {
          await this.poweroff(name);
        }
      } catch {
        // 可能已经不存在
      }

      // 删除 VM 和所有关联文件
      await execAsync(`VBoxManage unregistervm "${name}" --delete`);
      this.vms.delete(name);
      log.info(`VM "${name}" 已删除`);
    } catch (error: any) {
      log.error(`删除 VM 失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 创建快照
   */
  async snapshot(name: string, tag: string, description?: string): Promise<void> {
    log.info(`创建快照：${name} -> ${tag}`);

    try {
      const desc = description ? `--description "${description}"` : "";
      await execAsync(`VBoxManage snapshot "${name}" take "${tag}" ${desc}`);
      log.info(`快照 "${tag}" 已创建`);
    } catch (error: any) {
      log.error(`创建快照失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 恢复快照
   */
  async restore(name: string, tag: string): Promise<void> {
    log.info(`恢复快照：${name} <- ${tag}`);

    try {
      // 先关闭 VM
      try {
        const status = await this.getStatus(name);
        if (status === "running" || status === "paused") {
          await this.poweroff(name);
        }
      } catch {
        // 可能已经停止
      }

      // 恢复快照
      await execAsync(`VBoxManage snapshot "${name}" restore "${tag}"`);

      // 重新启动 VM
      await this.start(name);
      log.info(`快照 "${tag}" 已恢复`);
    } catch (error: any) {
      log.error(`恢复快照失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 删除快照
   */
  async deleteSnapshot(name: string, tag: string): Promise<void> {
    log.info(`删除快照：${name} ${tag}`);

    try {
      await execAsync(`VBoxManage snapshot "${name}" delete "${tag}"`);
      log.info(`快照 "${tag}" 已删除`);
    } catch (error: any) {
      log.error(`删除快照失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 获取 VM IP 地址
   */
  async getIP(name: string): Promise<string> {
    try {
      // 方法 1: 从 Guest Additions 获取
      const { stdout } = await execAsync(
        `VBoxManage guestproperty get "${name}" "/VirtualBox/GuestInfo/Net/0/V4/IP"`,
      );
      const ip = stdout.replace("Value: ", "").trim();
      if (ip && ip !== "<no value>") {
        return ip;
      }
    } catch {
      log.debug("无法从 Guest Additions 获取 IP，使用 localhost");
    }

    // 方法 2: 使用端口转发 (localhost)
    return "127.0.0.1";
  }

  /**
   * 获取 SSH 端口
   */
  async getSSHPort(name: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `VBoxManage showvminfo "${name}" --machinereadable | grep "natpf1"`,
      );
      const match = stdout.match(/ssh,tcp,,(\d+),,22/);
      if (match) {
        return parseInt(match[1]);
      }
    } catch {
      log.debug("无法获取 SSH 端口，使用默认值 2222");
    }

    return 2222;
  }

  /**
   * 执行命令 (通过 SSH)
   */
  async exec(name: string, cmd: string): Promise<VMExecResult> {
    const ip = await this.getIP(name);
    const port = await this.getSSHPort(name);

    log.debug(`执行命令：${cmd} @ ${ip}:${port}`);

    try {
      const result = await SSHClient.exec(ip, cmd, {
        port,
        username: "vagrant",
        privateKeyPath: this.getInsecureKeyPath(),
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
      };
    } catch (error: any) {
      log.error(`执行命令失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 上传文件
   */
  async upload(name: string, localPath: string, remotePath: string): Promise<void> {
    const ip = await this.getIP(name);
    const port = await this.getSSHPort(name);

    log.info(`上传文件：${localPath} -> ${remotePath}`);

    const ssh = new SSHClient({
      host: ip,
      port,
      username: "vagrant",
      privateKeyPath: this.getInsecureKeyPath(),
    });

    try {
      await ssh.connect();
      await ssh.upload(localPath, remotePath);
      log.info("文件上传完成");
    } finally {
      ssh.close();
    }
  }

  /**
   * 下载文件
   */
  async download(name: string, remotePath: string, localPath: string): Promise<void> {
    const ip = await this.getIP(name);
    const port = await this.getSSHPort(name);

    log.info(`下载文件：${remotePath} -> ${localPath}`);

    const ssh = new SSHClient({
      host: ip,
      port,
      username: "vagrant",
      privateKeyPath: this.getInsecureKeyPath(),
    });

    try {
      await ssh.connect();
      await ssh.download(remotePath, localPath);
      log.info("文件下载完成");
    } finally {
      ssh.close();
    }
  }

  /**
   * 截图
   */
  async screenshot(name: string, outputPath: string): Promise<string> {
    log.info(`截图：${name} -> ${outputPath}`);

    try {
      // 检查 VM 是否运行
      const status = await this.getStatus(name);
      if (status !== "running") {
        throw new Error("VM 未运行，无法截图");
      }

      await execAsync(`VBoxManage controlvm "${name}" screenshotpng "${outputPath}"`);
      log.info(`截图完成：${outputPath}`);
      return outputPath;
    } catch (error: any) {
      log.error(`截图失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 获取 VM 状态
   */
  async getStatus(name: string): Promise<VMStatus> {
    try {
      const { stdout } = await execAsync(
        `VBoxManage showvminfo "${name}" | grep "VM state:"`,
      );
      const match = stdout.match(/VM state:\s+(\w+)/);
      if (match) {
        const state = match[1];
        if (state === "running") return "running";
        if (state === "paused") return "paused";
        if (state === "saved") return "saved";
        return "stopped";
      }
    } catch {
      // VM 可能不存在
    }

    return "stopped";
  }

  /**
   * 列出所有 VM
   */
  async list(): Promise<VMInstance[]> {
    try {
      const { stdout } = await execAsync("VBoxManage list vms");
      const lines = stdout.trim().split("\n").filter(Boolean);

      const vms: VMInstance[] = [];
      for (const line of lines) {
        const match = line.match(/"([^"]+)" \{([^}]+)\}/);
        if (match) {
          const vmName = match[1];
          const id = match[2];
          const status = await this.getStatus(vmName);

          vms.push({
            id,
            name: vmName,
            status,
            provider: "vbox",
            capabilities: {
              snapshot: true,
              screenshot: true,
              gui: true,
              headless: true,
            },
          });
        }
      }

      return vms;
    } catch {
      return [];
    }
  }

  // ===== 辅助方法 =====

  /**
   * 映射操作系统类型
   */
  private mapOSType(os: string): string {
    const mapping: Record<string, string> = {
      "ubuntu-22.04": "Ubuntu_64",
      "ubuntu-24.04": "Ubuntu_64",
      "ubuntu-20.04": "Ubuntu_64",
      "ubuntu": "Ubuntu_64",
      "debian-12": "Debian_64",
      "debian-11": "Debian_64",
      "debian": "Debian_64",
      "centos-7": "RedHat_64",
      "centos-8": "RedHat_64",
      "centos": "RedHat_64",
      "linux": "Ubuntu_64",
    };

    return mapping[os] || "Ubuntu_64";
  }

  /**
   * 等待 VM 达到指定状态
   */
  private async waitForStatus(name: string, status: string, timeout = 60000): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const current = await this.getStatus(name);
      if (current === status) {
        return;
      }
      await this.sleep(1000);
    }

    throw new Error(`等待 VM 状态超时：${status}`);
  }

  /**
   * 等待 SSH 可用
   */
  private async waitForSSH(name: string, timeout = 120000): Promise<void> {
    const ip = await this.getIP(name);
    const port = await this.getSSHPort(name);
    const start = Date.now();

    log.info(`等待 SSH 连接：${ip}:${port}`);

    while (Date.now() - start < timeout) {
      try {
        const ssh = new SSHClient({
          host: ip,
          port,
          username: "vagrant",
          privateKeyPath: this.getInsecureKeyPath(),
        });
        await ssh.connect();
        ssh.close();
        log.info("SSH 连接成功");
        return;
      } catch {
        await this.sleep(2000);
      }
    }

    throw new Error("等待 SSH 连接超时");
  }

  /**
   * 获取不安全私钥路径 (Vagrant 默认密钥)
   */
  private getInsecureKeyPath(): string {
    const home = process.platform === "win32"
      ? process.env.USERPROFILE!
      : process.env.HOME!;

    // 常见的 insecure key 路径
    const paths = [
      `${home}/.vagrant.d/insecure_private_key`,
      `${home}/.ssh/insecure_private_key`,
      `${home}/.ssh/id_rsa`,
      `${home}/.ssh/id_ed25519`,
    ];

    for (const p of paths) {
      try {
        require("fs").accessSync(p);
        return p;
      } catch {
        continue;
      }
    }

    return paths[0]; // 返回默认路径
  }

  /**
   * 延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
