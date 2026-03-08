/**
 * VM 提供者注册表
 *
 * 自动检测并选择最佳可用的 VM 提供者
 */

import type { VMInstance } from "./base";
import { VMProviderBase } from "./base";
import { Log } from "@/util/log";

const log = Log.create({ service: "vm.registry" });

export type ProviderName = "virtualbox" | "virtualbox-remote" | "docker" | "wsl" | "auto";

export interface ProviderRegistry {
  /**
   * 获取提供者实例
   */
  getProvider(name?: ProviderName): Promise<VMProviderBase>;

  /**
   * 获取推荐的提供者
   */
  getRecommendedProvider(): ProviderName;

  /**
   * 列出所有可用的提供者
   */
  getAvailableProviders(): Promise<ProviderInfo[]>;
}

export interface ProviderInfo {
  name: ProviderName;
  available: boolean;
  capabilities: {
    createVM: boolean;
    snapshot: boolean;
    screenshot: boolean;
    gui: boolean;
  };
  priority: number; // 优先级，数字越小优先级越高
}

class DefaultProviderRegistry implements ProviderRegistry {
  private providers: Map<ProviderName, VMProviderBase> = new Map();

  /**
   * 获取提供者实例
   */
  async getProvider(name: ProviderName = "auto"): Promise<VMProviderBase> {
    if (name === "auto") {
      name = this.getRecommendedProvider();
      log.info(`自动选择提供者：${name}`);
    }

    if (this.providers.has(name)) {
      return this.providers.get(name)!;
    }

    const provider = await this.createProvider(name);
    this.providers.set(name, provider);
    return provider;
  }

  /**
   * 获取推荐的提供者
   *
   * 优先级规则:
   * 1. VirtualBox (功能最全，跨平台)
   * 2. Docker (轻量级，但不支持 GUI)
   * 3. WSL (仅 Windows)
   */
  getRecommendedProvider(): ProviderName {
    // 优先 VirtualBox
    if (this.hasVirtualBox()) {
      return "virtualbox";
    }

    // 备选 Docker
    if (this.hasDocker()) {
      return "docker";
    }

    // Windows 用户使用 WSL
    if (process.platform === "win32" && this.hasWSL()) {
      return "wsl";
    }

    throw new Error(
      "未找到可用的 VM 提供者。请安装 VirtualBox (https://www.virtualbox.org) 或 Docker",
    );
  }

  /**
   * 列出所有可用的提供者
   */
  async getAvailableProviders(): Promise<ProviderInfo[]> {
    const providers: ProviderInfo[] = [];

    // VirtualBox
    const hasVBox = this.hasVirtualBox();
    providers.push({
      name: "virtualbox",
      available: hasVBox,
      capabilities: {
        createVM: hasVBox,
        snapshot: hasVBox,
        screenshot: hasVBox,
        gui: hasVBox,
      },
      priority: 1,
    });

    // Docker
    const hasDocker = this.hasDocker();
    providers.push({
      name: "docker",
      available: hasDocker,
      capabilities: {
        createVM: hasDocker,
        snapshot: hasDocker,
        screenshot: false,
        gui: false,
      },
      priority: 2,
    });

    // WSL
    const hasWSL = this.hasWSL();
    providers.push({
      name: "wsl",
      available: hasWSL,
      capabilities: {
        createVM: hasWSL,
        snapshot: false,
        screenshot: false,
        gui: false,
      },
      priority: 3,
    });

    return providers.sort((a, b) => a.priority - b.priority);
  }

  private async createProvider(name: ProviderName): Promise<VMProviderBase> {
    switch (name) {
      case "virtualbox":
        const { VirtualBoxProvider } = await import("./virtualbox-provider");
        return new VirtualBoxProvider();

      case "virtualbox-remote":
        const { VirtualBoxRemoteProvider } = await import("./virtualbox-remote-provider");
        return new VirtualBoxRemoteProvider();

      case "docker":
        const { DockerProvider } = await import("./docker-provider");
        return new DockerProvider();

      case "wsl":
        const { WSLProvider } = await import("./wsl-provider");
        return new WSLProvider();

      default:
        throw new Error(`未知的提供者：${name}`);
    }
  }

  /**
   * 检查 VirtualBox 是否可用
   */
  private hasVirtualBox(): boolean {
    try {
      require("child_process").execSync("VBoxManage --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查 Docker 是否可用
   */
  private hasDocker(): boolean {
    try {
      require("child_process").execSync("docker --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查 WSL 是否可用
   */
  private hasWSL(): boolean {
    if (process.platform !== "win32") {
      return false;
    }

    try {
      require("child_process").execSync("wsl --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 单例注册表
 */
export const providerRegistry = new DefaultProviderRegistry();

/**
 * 获取默认 VM 提供者
 */
export async function getVMProvider(): Promise<VMProviderBase> {
  return providerRegistry.getProvider("auto");
}

/**
 * 获取指定 VM 提供者
 */
export async function getProvider(name: ProviderName): Promise<VMProviderBase> {
  return providerRegistry.getProvider(name);
}
