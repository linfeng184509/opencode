/**
 * VM 模块导出
 */

// 基础类型和接口
export {
  VMProviderBase,
  type VMConfig,
  type VMInstance,
  type VMStatus,
  type VMExecResult,
} from "./base";

// SSH 客户端
export { SSHClient, type SSHConfig, type SSHExecResult } from "./ssh-client";

// 提供者实现
export { VirtualBoxProvider, type VirtualBoxVM } from "./virtualbox-provider";
export { DockerProvider, type DockerVM } from "./docker-provider";
export { WSLProvider, type WSLVM } from "./wsl-provider";

// 注册表
export {
  providerRegistry,
  getVMProvider,
  getProvider,
  type ProviderName,
  type ProviderInfo,
  type ProviderRegistry,
} from "./registry";
