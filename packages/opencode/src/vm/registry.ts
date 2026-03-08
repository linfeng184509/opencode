/**
 * VM 提供者注册表
 *
 * 仅支持 VirtualBox (本地和远程)
 */

import type { VMInstance } from "./base";
import { VMProviderBase } from "./base";
import { Log } from "@/util/log";

const log = Log.create({ service: "vm.registry" });

export type ProviderName = "virtualbox" | "virtualbox-remote" | "auto";

export interface ProviderRegistry {
  getProvider(name?: ProviderName): Promise<VMProviderBase>;
  getRecommendedProvider(): ProviderName;
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
  priority: number;
}

class DefaultProviderRegistry implements ProviderRegistry {
  private providers: Map<ProviderName, VMProviderBase> = new Map();

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
   * 优先 VirtualBox，远程 VirtualBox 需要手动指定
   */
  getRecommendedProvider(): ProviderName {
    if (this.hasVirtualBox()) {
      return "virtualbox";
    }

    throw new Error(
      "未找到 VirtualBox。请安装 VirtualBox (https://www.virtualbox.org)",
    );
  }

  async getAvailableProviders(): Promise<ProviderInfo[]> {
    const providers: ProviderInfo[] = [];

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

    return providers;
  }

  private async createProvider(name: ProviderName): Promise<VMProviderBase> {
    switch (name) {
      case "virtualbox":
        const { VirtualBoxProvider } = await import("./virtualbox-provider");
        return new VirtualBoxProvider();

      case "virtualbox-remote":
        const { VirtualBoxRemoteProvider } = await import("./virtualbox-remote-provider");
        return new VirtualBoxRemoteProvider();

      default:
        throw new Error(`未知的提供者：${name}`);
    }
  }

  private hasVirtualBox(): boolean {
    try {
      require("child_process").execSync("VBoxManage --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

export const providerRegistry = new DefaultProviderRegistry();

export async function getVMProvider(): Promise<VMProviderBase> {
  return providerRegistry.getProvider("auto");
}

export async function getProvider(name: ProviderName): Promise<VMProviderBase> {
  return providerRegistry.getProvider(name);
}
