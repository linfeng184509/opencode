/**
 * Docker VM 提供者 (备用方案)
 *
 * 当 VirtualBox 不可用时的轻量级替代方案
 * 不支持 GUI 和截图，但跨平台一致性好
 */

import { VMProviderBase } from "./base";
import type { VMConfig, VMInstance, VMStatus, VMExecResult } from "./base";
import { exec } from "child_process";
import { promisify } from "util";
import { Log } from "@/util/log";

const execAsync = promisify(exec);
const log = Log.create({ service: "vm.docker" });

export interface DockerVM extends VMInstance {
  provider: "docker";
  containerId: string;
}

export class DockerProvider extends VMProviderBase {
  private vms: Map<string, DockerVM> = new Map();

  /**
   * 检查 Docker 是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execAsync("docker --version");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 创建容器 (作为 VM 使用)
   */
  async create(config: VMConfig): Promise<DockerVM> {
    const { name, os } = config;
    const image = this.mapOSImage(os);

    log.info(`创建容器：${name}`, { image });

    try {
      // 检查容器是否已存在
      try {
        await execAsync(`docker inspect ${name}`);
        throw new Error(`容器 "${name}" 已存在`);
      } catch (err: any) {
        if (!err.message.includes("No such object")) {
          throw err;
        }
      }

      // 创建并启动容器
      await execAsync(
        `docker run -d --name "${name}" --privileged ` +
        `-v "${name}_workspace:/workspace" ` +
        `${image} tail -f /dev/null`,
      );

      log.info(`容器 "${name}" 已创建`);

      const vm: DockerVM = {
        id: name,
        name,
        status: "running",
        provider: "docker",
        containerId: name,
        capabilities: {
          snapshot: true,
          screenshot: false,
          gui: false,
          headless: true,
        },
      };

      this.vms.set(name, vm);
      return vm;
    } catch (error: any) {
      log.error(`创建容器失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 启动容器
   */
  async start(name: string): Promise<void> {
    log.info(`启动容器：${name}`);

    try {
      await execAsync(`docker start ${name}`);
      await this.waitForReady(name);
      log.info(`容器 "${name}" 已启动`);
    } catch (error: any) {
      log.error(`启动容器失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 停止容器
   */
  async stop(name: string): Promise<void> {
    log.info(`停止容器：${name}`);

    try {
      await execAsync(`docker stop ${name}`);
      log.info(`容器 "${name}" 已停止`);
    } catch (error: any) {
      log.error(`停止容器失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 强制关闭容器
   */
  async poweroff(name: string): Promise<void> {
    log.info(`强制关闭容器：${name}`);

    try {
      await execAsync(`docker kill ${name}`);
      log.info(`容器 "${name}" 已强制关闭`);
    } catch (error: any) {
      log.error(`强制关闭容器失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 删除容器
   */
  async destroy(name: string): Promise<void> {
    log.info(`删除容器：${name}`);

    try {
      // 先停止
      try {
        await this.stop(name);
      } catch {
        // 可能已经停止
      }

      // 删除容器
      await execAsync(`docker rm ${name}`);

      // 删除关联卷
      try {
        await execAsync(`docker volume rm ${name}_workspace`);
      } catch {
        // 卷可能不存在
      }

      this.vms.delete(name);
      log.info(`容器 "${name}" 已删除`);
    } catch (error: any) {
      log.error(`删除容器失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 创建快照 (使用 docker commit)
   */
  async snapshot(name: string, tag: string): Promise<void> {
    log.info(`创建快照：${name} -> ${tag}`);

    try {
      const imageName = `${name}:${tag}`;
      await execAsync(`docker commit ${name} ${imageName}`);
      log.info(`快照 "${tag}" 已创建为镜像：${imageName}`);
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
      const imageName = `${name}:${tag}`;

      // 停止并删除当前容器
      try {
        await this.destroy(name);
      } catch {
        // 忽略错误
      }

      // 从快照重新创建容器
      await execAsync(
        `docker run -d --name "${name}" --privileged ` +
        `-v "${name}_workspace:/workspace" ` +
        `${imageName} tail -f /dev/null`,
      );

      await this.waitForReady(name);
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
      const imageName = `${name}:${tag}`;
      await execAsync(`docker rmi ${imageName}`);
      log.info(`快照镜像 "${tag}" 已删除`);
    } catch (error: any) {
      log.error(`删除快照失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 获取容器 IP
   */
  async getIP(name: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${name}`,
      );
      return stdout.trim() || "localhost";
    } catch {
      return "localhost";
    }
  }

  /**
   * 获取 SSH 端口 (Docker  provider 使用 docker exec)
   */
  async getSSHPort(): Promise<number> {
    return 0; // Docker 使用 docker exec，不需要 SSH 端口
  }

  /**
   * 执行命令 (使用 docker exec)
   */
  async exec(name: string, cmd: string): Promise<VMExecResult> {
    log.debug(`执行命令：${cmd}`);

    try {
      const { stdout, stderr } = await execAsync(
        `docker exec ${name} /bin/bash -c "${cmd.replace(/"/g, '\\"')}"`,
      );

      return {
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error: any) {
      // docker exec 失败时返回错误码
      return {
        stdout: error.stdout || "",
        stderr: error.stderr || error.message,
        exitCode: error.status || 1,
      };
    }
  }

  /**
   * 上传文件 (使用 docker cp)
   */
  async upload(name: string, localPath: string, remotePath: string): Promise<void> {
    log.info(`上传文件：${localPath} -> ${remotePath}`);

    try {
      await execAsync(`docker cp "${localPath}" ${name}:"${remotePath}"`);
      log.info("文件上传完成");
    } catch (error: any) {
      log.error(`上传文件失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 下载文件 (使用 docker cp)
   */
  async download(name: string, remotePath: string, localPath: string): Promise<void> {
    log.info(`下载文件：${remotePath} -> ${localPath}`);

    try {
      await execAsync(`docker cp ${name}:"${remotePath}" "${localPath}"`);
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
    throw new Error("Docker provider 不支持截图功能");
  }

  /**
   * 获取容器状态
   */
  async getStatus(name: string): Promise<VMStatus> {
    try {
      const { stdout } = await execAsync(
        `docker inspect -f '{{.State.Status}}' ${name}`,
      );

      const status = stdout.trim();
      if (status === "running") return "running";
      if (status === "paused") return "paused";
      if (status === "restarting") return "running";
      return "stopped";
    } catch {
      return "stopped";
    }
  }

  /**
   * 列出所有容器
   */
  async list(): Promise<VMInstance[]> {
    try {
      const { stdout } = await execAsync(
        `docker ps -a --format "{{.Names}}"`,
      );

      const names = stdout.trim().split("\n").filter(Boolean);
      const vms: VMInstance[] = [];

      for (const name of names) {
        const status = await this.getStatus(name);
        vms.push({
          id: name,
          name,
          status,
          provider: "docker",
          capabilities: {
            snapshot: true,
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
   * 映射操作系统到 Docker 镜像
   */
  private mapOSImage(os: string): string {
    const mapping: Record<string, string> = {
      "ubuntu-22.04": "ubuntu:22.04",
      "ubuntu-24.04": "ubuntu:24.04",
      "ubuntu-20.04": "ubuntu:20.04",
      "ubuntu": "ubuntu:22.04",
      "debian-12": "debian:bookworm",
      "debian-11": "debian:bullseye",
      "debian": "debian:bookworm",
      "centos-7": "centos:7",
      "centos-8": "rockylinux:8",
      "centos": "rockylinux:9",
      "linux": "ubuntu:22.04",
      "alpine": "alpine:latest",
    };

    return mapping[os] || "ubuntu:22.04";
  }

  /**
   * 等待容器就绪
   */
  private async waitForReady(name: string, timeout = 30000): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        await this.exec(name, "echo ready");
        return;
      } catch {
        await this.sleep(1000);
      }
    }

    throw new Error("等待容器就绪超时");
  }

  /**
   * 延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
