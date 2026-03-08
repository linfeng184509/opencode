/**
 * VM 远程 VirtualBox 连接工具
 *
 * 通过 SSH 连接到 VirtualBox 主机 (本地或远程) 并管理虚拟机
 */

import { z } from "zod";
import { Tool } from "./tool";
import type { VirtualBoxRemoteConfig } from "../vm/virtualbox-remote-provider";
import { VirtualBoxRemoteProvider } from "../vm/virtualbox-remote-provider";
import { Log } from "@/util/log";

const log = Log.create({ service: "tool.vm-remote-vbox" });

const ConnectConfigSchema = z.object({
  name: z.string().describe("连接名称/标识"),
  remote_host: z.string().optional().describe("远程主机 IP 或域名 (留空表示本地 127.0.0.1)"),
  ssh_port: z.number().default(2222).describe("SSH 端口 (默认 2222)"),
  ssh_username: z.string().default("vagrant").describe("SSH 用户名 (默认 vagrant)"),
  private_key: z.string().optional().describe("私钥内容"),
  private_key_path: z.string().optional().describe("私钥文件路径"),
  password: z.string().optional().describe("密码"),
});

export const VMRemoteVBoxConnectTool = Tool.define("vm_remote_vbox_connect", async () => ({
  description: "通过 SSH 连接到 VirtualBox 主机 (本地/远程) 并管理虚拟机",
  parameters: ConnectConfigSchema,
  execute: async (args, _ctx) => {
    const { name, remote_host, ssh_port, ssh_username, private_key, private_key_path, password } = args;
    const config: VirtualBoxRemoteConfig = { name, remote_host, ssh_port, ssh_username, private_key, private_key_path, password };

    try {
      const provider = new VirtualBoxRemoteProvider();
      await provider.create(config);
      const vms = await provider.list();

      let output = `VirtualBox 连接成功\n\n`;
      output += `连接信息:\n  - 名称：${name}\n  - 主机：${remote_host || "127.0.0.1"}:${ssh_port}\n  - 用户：${ssh_username}\n\n`;
      output += `可用虚拟机 (${vms.length} 台):\n`;
      if (vms.length > 0) {
        for (const vm of vms) output += `  - ${vm.name} (${vm.status})\n`;
      } else {
        output += `  (无)\n`;
      }

      return { title: `连接 VirtualBox: ${name}`, output, metadata: { host: remote_host || "127.0.0.1", port: ssh_port, username: ssh_username, vms } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `连接失败：${name}`, output: `错误：${msg}\n\n请检查:\n  - 主机地址和端口是否正确\n  - SSH 服务是否运行\n  - 认证信息 (私钥/密码) 是否正确\n  - VirtualBox 是否已安装`, metadata: { host: "", port: 0, username: "", vms: [] } };
    }
  },
}));

export const VMRemoteVBoxDisconnectTool = Tool.define("vm_remote_vbox_disconnect", async () => ({
  description: "断开与 VirtualBox 主机的连接 (清理本地缓存)",
  parameters: z.object({ name: z.string().describe("连接名称") }),
  execute: async (args) => ({ title: `断开连接：${args.name}`, output: `连接 "${args.name}" 已从本地缓存中移除 (VM 仍在运行)`, metadata: {} }),
}));

export const VMRemoteVBoxStartTool = Tool.define("vm_remote_vbox_start", async () => ({
  description: "启动 VirtualBox 虚拟机",
  parameters: ConnectConfigSchema.extend({ vm_name: z.string().describe("虚拟机名称"), headless: z.boolean().default(true).describe("无头模式启动") }),
  execute: async (args) => {
    const { name, vm_name, remote_host, ssh_port, ssh_username, private_key, private_key_path, password, headless } = args;
    const config: VirtualBoxRemoteConfig = { name: vm_name, remote_host, ssh_port, ssh_username, private_key, private_key_path, password };
    try {
      const provider = new VirtualBoxRemoteProvider();
      await provider.create(config);
      await provider.start(vm_name, headless);
      const ip = await provider.getIP(vm_name);
      const port = await provider.getSSHPort(vm_name);
      return { title: `启动 VM: ${vm_name}`, output: `VM 已启动\n  - IP: ${ip}\n  - SSH 端口：${port}`, metadata: { ip, port } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `启动 VM 失败`, output: `错误：${msg}`, metadata: { ip: "", port: 0 } };
    }
  },
}));

export const VMRemoteVBoxStopTool = Tool.define("vm_remote_vbox_stop", async () => ({
  description: "停止 VirtualBox 虚拟机",
  parameters: ConnectConfigSchema.extend({ vm_name: z.string().describe("虚拟机名称"), force: z.boolean().default(false).describe("强制关闭") }),
  execute: async (args) => {
    const { name, vm_name, remote_host, ssh_port, ssh_username, private_key, private_key_path, password, force } = args;
    const config: VirtualBoxRemoteConfig = { name: vm_name, remote_host, ssh_port, ssh_username, private_key, private_key_path, password };
    try {
      const provider = new VirtualBoxRemoteProvider();
      await provider.create(config);
      if (force) await provider.poweroff(vm_name); else await provider.stop(vm_name);
      return { title: `停止 VM: ${vm_name}`, output: `VM 已${force ? "强制关闭" : "正常停止"}`, metadata: {} };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `停止 VM 失败`, output: `错误：${msg}`, metadata: {} };
    }
  },
}));

export const VMRemoteVBoxSnapshotTool = Tool.define("vm_remote_vbox_snapshot", async () => ({
  description: "为 VirtualBox 虚拟机创建快照",
  parameters: ConnectConfigSchema.extend({ vm_name: z.string().describe("虚拟机名称"), tag: z.string().describe("快照标签"), description: z.string().optional().describe("快照描述") }),
  execute: async (args) => {
    const { name, vm_name, tag, description, remote_host, ssh_port, ssh_username, private_key, private_key_path, password } = args;
    const config: VirtualBoxRemoteConfig = { name: vm_name, remote_host, ssh_port, ssh_username, private_key, private_key_path, password };
    try {
      const provider = new VirtualBoxRemoteProvider();
      await provider.create(config);
      await provider.snapshot(vm_name, tag, description);
      return { title: `创建快照：${vm_name} -> ${tag}`, output: `快照 "${tag}" 已创建${description ? `:\n  ${description}` : ""}`, metadata: { tag, description } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `创建快照失败`, output: `错误：${msg}`, metadata: { tag: "", description: "" } };
    }
  },
}));

export const VMRemoteVBoxRestoreTool = Tool.define("vm_remote_vbox_restore", async () => ({
  description: "恢复 VirtualBox 虚拟机的快照",
  parameters: ConnectConfigSchema.extend({ vm_name: z.string().describe("虚拟机名称"), tag: z.string().describe("快照标签") }),
  execute: async (args) => {
    const { name, vm_name, tag, remote_host, ssh_port, ssh_username, private_key, private_key_path, password } = args;
    const config: VirtualBoxRemoteConfig = { name: vm_name, remote_host, ssh_port, ssh_username, private_key, private_key_path, password };
    try {
      const provider = new VirtualBoxRemoteProvider();
      await provider.create(config);
      await provider.restore(vm_name, tag);
      return { title: `恢复快照：${vm_name} <- ${tag}`, output: `快照 "${tag}" 已恢复`, metadata: {} };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `恢复快照失败`, output: `错误：${msg}`, metadata: {} };
    }
  },
}));

export const VMRemoteVBoxExecTool = Tool.define("vm_remote_vbox_exec", async () => ({
  description: "在 VirtualBox 虚拟机中执行命令",
  parameters: ConnectConfigSchema.extend({ vm_name: z.string().describe("虚拟机名称"), command: z.string().describe("要执行的命令") }),
  execute: async (args) => {
    const { name, vm_name, command, remote_host, ssh_port, ssh_username, private_key, private_key_path, password } = args;
    const config: VirtualBoxRemoteConfig = { name: vm_name, remote_host, ssh_port, ssh_username, private_key, private_key_path, password };
    try {
      const provider = new VirtualBoxRemoteProvider();
      await provider.create(config);
      const result = await provider.exec(vm_name, command);
      let output = `命令执行完成\n\n  命令：${command}\n  退出码：${result.exitCode}\n`;
      if (result.stdout) output += `\n  输出:\n${result.stdout}\n`;
      if (result.stderr) output += `\n  错误输出:\n${result.stderr}\n`;
      return { title: `执行命令：${command.substring(0, 50)}...`, output, metadata: { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `执行命令失败`, output: `错误：${msg}`, metadata: { exitCode: -1, stdout: "", stderr: "" } };
    }
  },
}));
