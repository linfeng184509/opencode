/**
 * VM 远程 VirtualBox 连接工具
 *
 * 连接到远程 VirtualBox 主机并管理虚拟机
 */

import { z } from "zod";
import { Tool } from "./tool";
import type { VirtualBoxRemoteConfig } from "../vm/virtualbox-remote-provider";
import { VirtualBoxRemoteProvider } from "../vm/virtualbox-remote-provider";
import { Log } from "@/util/log";

const log = Log.create({ service: "tool.vm-remote-vbox" });

/**
 * VM_Remote_VBox_Connect - 连接远程 VirtualBox 主机
 */
export const VMRemoteVBoxConnectTool = Tool.define("vm_remote_vbox_connect", async () => ({
  description: "通过 SSH 连接到远程 VirtualBox 主机并管理虚拟机",
  parameters: z.object({
    name: z.string().describe("连接名称/标识"),
    remote_host: z.string().describe("远程 VirtualBox 主机 IP 或域名"),
    remote_ssh_port: z.number().default(22).describe("远程 SSH 端口"),
    remote_username: z.string().default("root").describe("远程 SSH 用户名"),
    auth_type: z.enum(["password", "key"]).default("password").describe("认证方式"),
    password: z.string().optional().describe("密码 (auth_type=password 时使用)"),
    private_key: z.string().optional().describe("私钥内容 (auth_type=key 时使用)"),
    private_key_path: z.string().optional().describe("私钥文件路径 (auth_type=key 时使用)"),
  }),
  execute: async (args, _ctx) => {
    const {
      name,
      remote_host,
      remote_ssh_port,
      remote_username,
      auth_type,
      password,
      private_key,
      private_key_path,
    } = args;

    const config: VirtualBoxRemoteConfig = {
      name,
      remote_host,
      remote_ssh_port,
      remote_username,
      auth_type,
      password,
      private_key,
      private_key_path,
      os: "linux",
    };

    try {
      const provider = new VirtualBoxRemoteProvider();

      // 测试连接
      await provider.create(config);

      // 列出远程主机上的所有 VM
      const result = await provider.exec(name, "VBoxManage list vms");

      let output = `远程 VirtualBox 连接成功\n\n`;
      output += `连接信息:\n`;
      output += `  - 名称：${name}\n`;
      output += `  - 主机：${remote_host}:${remote_ssh_port}\n`;
      output += `  - 用户：${remote_username}\n`;
      output += `  - 认证：${auth_type}\n\n`;

      output += `可用虚拟机:\n`;
      if (result.exitCode === 0) {
        const vms = result.stdout.trim() || "无";
        output += `${vms}\n`;
      } else {
        output += `无法获取虚拟机列表\n`;
      }

      return {
        title: `连接远程 VirtualBox: ${name}`,
        output,
        metadata: {
          host: remote_host,
          port: remote_ssh_port,
          username: remote_username,
        },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `连接远程 VirtualBox 失败：${name}`,
        output: `错误：${msg}\n\n请检查:\n  - 主机地址和端口是否正确\n  - SSH 服务是否运行\n  - 认证信息 (密码/私钥) 是否正确\n  - 远程主机是否安装了 VirtualBox`,
        metadata: {} as Record<string, unknown>,
      };
    }
  },
}));

/**
 * VM_Remote_VBox_Disconnect - 断开远程连接
 */
export const VMRemoteVBoxDisconnectTool = Tool.define("vm_remote_vbox_disconnect", async () => ({
  description: "断开与远程 VirtualBox 主机的连接",
  parameters: z.object({
    name: z.string().describe("连接名称"),
  }),
  execute: async (args, _ctx) => {
    const { name } = args;

    try {
      // 清理连接
      return {
        title: `断开远程连接：${name}`,
        output: `已断开与远程 VirtualBox 主机 "${name}" 的连接`,
        metadata: {},
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `断开远程连接失败`,
        output: `错误：${msg}`,
        metadata: {} as Record<string, unknown>,
      };
    }
  },
}));

/**
 * VM_Remote_VBox_Start - 启动远程 VM
 */
export const VMRemoteVBoxStartTool = Tool.define("vm_remote_vbox_start", async () => ({
  description: "启动远程 VirtualBox 虚拟机",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    remote_host: z.string().describe("远程主机 IP 或域名"),
    remote_ssh_port: z.number().default(22).describe("SSH 端口"),
    remote_username: z.string().describe("远程 SSH 用户名"),
    auth_type: z.enum(["password", "key"]).default("password").describe("认证方式"),
    password: z.string().optional().describe("密码"),
    private_key: z.string().optional().describe("私钥内容"),
    private_key_path: z.string().optional().describe("私钥文件路径"),
    headless: z.boolean().default(true).describe("是否无头模式启动"),
  }),
  execute: async (args, _ctx) => {
    const {
      name,
      remote_host,
      remote_ssh_port,
      remote_username,
      auth_type,
      password,
      private_key,
      private_key_path,
      headless,
    } = args;

    try {
      const provider = new VirtualBoxRemoteProvider();

      // 先连接
      await provider.create({
        name: `conn-${name}`,
        remote_host,
        remote_ssh_port,
        remote_username,
        auth_type,
        password,
        private_key,
        private_key_path,
        os: "linux",
      });

      // 启动 VM
      await provider.start(name, headless);

      return {
        title: `启动远程 VM: ${name}`,
        output: `虚拟机 "${name}" 已启动 (${headless ? "无头模式" : "GUI 模式"})`,
        metadata: {},
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `启动远程 VM 失败`,
        output: `错误：${msg}`,
        metadata: {} as Record<string, unknown>,
      };
    }
  },
}));

/**
 * VM_Remote_VBox_Stop - 停止远程 VM
 */
export const VMRemoteVBoxStopTool = Tool.define("vm_remote_vbox_stop", async () => ({
  description: "停止远程 VirtualBox 虚拟机",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    remote_host: z.string().describe("远程主机 IP 或域名"),
    remote_ssh_port: z.number().default(22).describe("SSH 端口"),
    remote_username: z.string().describe("远程 SSH 用户名"),
    auth_type: z.enum(["password", "key"]).default("password").describe("认证方式"),
    password: z.string().optional().describe("密码"),
    private_key: z.string().optional().describe("私钥内容"),
    private_key_path: z.string().optional().describe("私钥文件路径"),
    force: z.boolean().default(false).describe("是否强制关闭"),
  }),
  execute: async (args, _ctx) => {
    const {
      name,
      remote_host,
      remote_ssh_port,
      remote_username,
      auth_type,
      password,
      private_key,
      private_key_path,
      force,
    } = args;

    try {
      const provider = new VirtualBoxRemoteProvider();

      // 先连接
      await provider.create({
        name: `conn-${name}`,
        remote_host,
        remote_ssh_port,
        remote_username,
        auth_type,
        password,
        private_key,
        private_key_path,
        os: "linux",
      });

      // 停止 VM
      if (force) {
        await provider.poweroff(name);
      } else {
        await provider.stop(name);
      }

      return {
        title: `停止远程 VM: ${name}`,
        output: `虚拟机 "${name}" 已${force ? "强制关闭" : "正常停止"}`,
        metadata: {},
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `停止远程 VM 失败`,
        output: `错误：${msg}`,
        metadata: {} as Record<string, unknown>,
      };
    }
  },
}));

/**
 * VM_Remote_VBox_Snapshot - 创建快照
 */
export const VMRemoteVBoxSnapshotTool = Tool.define("vm_remote_vbox_snapshot", async () => ({
  description: "为远程 VirtualBox 虚拟机创建快照",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    tag: z.string().describe("快照标签"),
    description: z.string().optional().describe("快照描述"),
    remote_host: z.string().describe("远程主机 IP 或域名"),
    remote_ssh_port: z.number().default(22).describe("SSH 端口"),
    remote_username: z.string().describe("远程 SSH 用户名"),
    auth_type: z.enum(["password", "key"]).default("password").describe("认证方式"),
    password: z.string().optional().describe("密码"),
    private_key: z.string().optional().describe("私钥内容"),
    private_key_path: z.string().optional().describe("私钥文件路径"),
  }),
  execute: async (args, _ctx) => {
    const {
      name,
      tag,
      description,
      remote_host,
      remote_ssh_port,
      remote_username,
      auth_type,
      password,
      private_key,
      private_key_path,
    } = args;

    try {
      const provider = new VirtualBoxRemoteProvider();

      // 先连接
      await provider.create({
        name: `conn-${name}`,
        remote_host,
        remote_ssh_port,
        remote_username,
        auth_type,
        password,
        private_key,
        private_key_path,
        os: "linux",
      });

      // 创建快照
      await provider.snapshot(name, tag, description);

      return {
        title: `创建快照：${name} -> ${tag}`,
        output: `快照 "${tag}" 已创建${description ? `:\n  ${description}` : ""}`,
        metadata: {},
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `创建快照失败`,
        output: `错误：${msg}`,
        metadata: {} as Record<string, unknown>,
      };
    }
  },
}));

/**
 * VM_Remote_VBox_Restore - 恢复快照
 */
export const VMRemoteVBoxRestoreTool = Tool.define("vm_remote_vbox_restore", async () => ({
  description: "恢复远程 VirtualBox 虚拟机的快照",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    tag: z.string().describe("快照标签"),
    remote_host: z.string().describe("远程主机 IP 或域名"),
    remote_ssh_port: z.number().default(22).describe("SSH 端口"),
    remote_username: z.string().describe("远程 SSH 用户名"),
    auth_type: z.enum(["password", "key"]).default("password").describe("认证方式"),
    password: z.string().optional().describe("密码"),
    private_key: z.string().optional().describe("私钥内容"),
    private_key_path: z.string().optional().describe("私钥文件路径"),
  }),
  execute: async (args, _ctx) => {
    const {
      name,
      tag,
      remote_host,
      remote_ssh_port,
      remote_username,
      auth_type,
      password,
      private_key,
      private_key_path,
    } = args;

    try {
      const provider = new VirtualBoxRemoteProvider();

      // 先连接
      await provider.create({
        name: `conn-${name}`,
        remote_host,
        remote_ssh_port,
        remote_username,
        auth_type,
        password,
        private_key,
        private_key_path,
        os: "linux",
      });

      // 恢复快照
      await provider.restore(name, tag);

      return {
        title: `恢复快照：${name} <- ${tag}`,
        output: `快照 "${tag}" 已恢复`,
        metadata: {},
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `恢复快照失败`,
        output: `错误：${msg}`,
        metadata: {} as Record<string, unknown>,
      };
    }
  },
}));

/**
 * VM_Remote_VBox_Exec - 在远程 VM 执行命令
 */
export const VMRemoteVBoxExecTool = Tool.define("vm_remote_vbox_exec", async () => ({
  description: "在远程 VirtualBox 虚拟机中执行命令 (需要 Guest Additions)",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    command: z.string().describe("要执行的命令"),
    remote_host: z.string().describe("远程主机 IP 或域名"),
    remote_ssh_port: z.number().default(22).describe("SSH 端口"),
    remote_username: z.string().describe("远程 SSH 用户名"),
    auth_type: z.enum(["password", "key"]).default("password").describe("认证方式"),
    password: z.string().optional().describe("密码"),
    private_key: z.string().optional().describe("私钥内容"),
    private_key_path: z.string().optional().describe("私钥文件路径"),
  }),
  execute: async (args, _ctx) => {
    const {
      name,
      command,
      remote_host,
      remote_ssh_port,
      remote_username,
      auth_type,
      password,
      private_key,
      private_key_path,
    } = args;

    try {
      const provider = new VirtualBoxRemoteProvider();

      // 先连接
      await provider.create({
        name: `conn-${name}`,
        remote_host,
        remote_ssh_port,
        remote_username,
        auth_type,
        password,
        private_key,
        private_key_path,
        os: "linux",
      });

      // 执行命令
      const result = await provider.exec(name, command);

      let output = `命令执行完成\n\n`;
      output += `命令：${command}\n`;
      output += `退出码：${result.exitCode}\n\n`;

      if (result.stdout) {
        output += `输出:\n${result.stdout}\n\n`;
      }

      if (result.stderr) {
        output += `错误输出:\n${result.stderr}\n\n`;
      }

      return {
        title: `远程执行：${command.substring(0, 50)}...`,
        output,
        metadata: {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `远程执行失败`,
        output: `错误：${msg}`,
        metadata: {} as Record<string, unknown>,
      };
    }
  },
}));
