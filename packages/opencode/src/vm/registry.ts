/**
 * VM 提供者注册表
 *
 * 仅支持 VirtualBox Remote (通过 SSH 管理本地/远程 VirtualBox)
 */

import type { VMInstance } from "./base";
import { VMProviderBase } from "./base";
import { Log } from "@/util/log";

const log = Log.create({ service: "vm.registry" });

export type ProviderName = "virtualbox-remote" | "auto";

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
   * 默认使用 virtualbox-remote (本地 SSH 连接)
   */
  getRecommendedProvider(): ProviderName {
    return "virtualbox-remote";
  }

  async getAvailableProviders(): Promise<ProviderInfo[]> {
    return [{
      name: "virtualbox-remote",
      available: true,
      capabilities: {
        createVM: true,
        snapshot: true,
        screenshot: false,
        gui: false,
      },
      priority: 1,
    }];
  }

  private async createProvider(name: ProviderName): Promise<VMProviderBase> {
    switch (name) {
      case "virtualbox-remote":
        const { VirtualBoxRemoteProvider } = await import("./virtualbox-remote-provider");
        return new VirtualBoxRemoteProvider();

      default:
        throw new Error(`未知的提供者：${name}`);
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
