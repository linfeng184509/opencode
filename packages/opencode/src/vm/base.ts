/**
 * VM 提供者基础接口
 */

export type VMStatus = "running" | "stopped" | "paused" | "saved";

export interface VMConfig {
  /** 虚拟机名称 */
  name: string;
  /** 操作系统类型 */
  os: string;
  /** CPU 核心数 */
  cpu?: number;
  /** 内存大小 (如 "4G", "8192M") */
  memory?: string;
  /** 磁盘大小 (如 "20G", "50000M") */
  disk?: string;
  /** ISO 镜像路径 (可选) */
  iso?: string;
  /** SSH 端口转发 (默认 2222) */
  ssh_port?: number;
}

export interface VMInstance {
  /** 唯一标识 */
  id: string;
  /** 虚拟机名称 */
  name: string;
  /** 运行状态 */
  status: VMStatus;
  /** IP 地址 */
  ip?: string;
  /** 提供者类型 */
  provider: "vbox" | "docker" | "wsl" | "hyperv" | "utm" | "parallels" | "kvm" | "remote-ssh";
  /** 能力标识 */
  capabilities?: {
    snapshot: boolean;
    screenshot: boolean;
    gui: boolean;
    headless: boolean;
  };
}

export interface VMExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * VM 提供者基类接口
 */
export abstract class VMProviderBase {
  /**
   * 创建虚拟机
   */
  abstract create(config: VMConfig): Promise<VMInstance>;

  /**
   * 启动虚拟机
   */
  abstract start(name: string, headless?: boolean): Promise<void>;

  /**
   * 停止虚拟机
   */
  abstract stop(name: string): Promise<void>;

  /**
   * 强制关闭虚拟机
   */
  abstract poweroff(name: string): Promise<void>;

  /**
   * 删除虚拟机
   */
  abstract destroy(name: string): Promise<void>;

  /**
   * 创建快照
   */
  abstract snapshot(name: string, tag: string, description?: string): Promise<void>;

  /**
   * 恢复快照
   */
  abstract restore(name: string, tag: string): Promise<void>;

  /**
   * 删除快照
   */
  abstract deleteSnapshot(name: string, tag: string): Promise<void>;

  /**
   * 获取 VM IP 地址
   */
  abstract getIP(name: string): Promise<string>;

  /**
   * 获取 SSH 端口
   */
  abstract getSSHPort(name: string): Promise<number>;

  /**
   * 执行命令 (通过 SSH)
   */
  abstract exec(name: string, cmd: string): Promise<VMExecResult>;

  /**
   * 上传文件
   */
  abstract upload(name: string, localPath: string, remotePath: string): Promise<void>;

  /**
   * 下载文件
   */
  abstract download(name: string, remotePath: string, localPath: string): Promise<void>;

  /**
   * 截图
   */
  abstract screenshot(name: string, outputPath: string): Promise<string>;

  /**
   * 获取 VM 状态
   */
  abstract getStatus(name: string): Promise<VMStatus>;

  /**
   * 列出所有 VM
   */
  abstract list(): Promise<VMInstance[]>;

  /**
   * 检查提供者是否可用
   */
  abstract isAvailable(): Promise<boolean>;
}
