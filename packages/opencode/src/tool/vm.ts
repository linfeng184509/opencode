/**
 * VM 管理工具 (通过 SSH)
 */

import { z } from "zod";
import { Tool } from "./tool";
import { getVMProvider } from "../vm/registry";
import { Log } from "@/util/log";
import type { VMInstance, VMExecResult, VMStatus } from "../vm/base";

const log = Log.create({ service: "tool.vm" });

const VMConnectionSchema = z.object({
  remote_host: z.string().optional().describe("远程主机 IP (留空表示本地 127.0.0.1)"),
  ssh_port: z.number().default(2222).describe("SSH 端口 (默认 2222)"),
  ssh_username: z.string().default("vagrant").describe("SSH 用户名"),
  private_key_path: z.string().optional().describe("私钥文件路径"),
  password: z.string().optional().describe("密码"),
});

export const VMCreateTool = Tool.define("vm_create", async () => ({
  description: "创建或注册虚拟机 (通过 SSH)",
  parameters: VMConnectionSchema.extend({
    name: z.string().describe("虚拟机名称"),
    os: z.string().default("ubuntu-22.04").describe("操作系统类型"),
    cpu: z.number().default(2).describe("CPU 核心数"),
    memory: z.string().default("4096").describe("内存大小 (MB)"),
    disk: z.string().default("20G").describe("磁盘大小"),
  }),
  execute: async (args) => {
    const { name, os, cpu, memory, disk, remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      const vm = await vmProvider.create({ name, os, cpu, memory: `${memory}M`, disk, remote_host, ssh_port, ssh_username, private_key_path, password });
      return { title: `创建虚拟机：${name}`, output: `虚拟机 "${name}" 已注册\n  - 状态：${vm.status}\n  - OS: ${os}\n  - CPU: ${cpu} 核心\n  - 内存：${memory}MB\n  - 磁盘：${disk}`, metadata: { vm } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `创建虚拟机失败：${name}`, output: `错误：${msg}`, metadata: { vm: {} as VMInstance } };
    }
  },
}));

export const VMStartTool = Tool.define("vm_start", async () => ({
  description: "启动虚拟机",
  parameters: VMConnectionSchema.extend({ name: z.string().describe("虚拟机名称"), headless: z.boolean().default(true).describe("无头模式启动") }),
  execute: async (args) => {
    const { name, headless, remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      await vmProvider.create({ name, remote_host, ssh_port, ssh_username, private_key_path, password, os: "linux" });
      await vmProvider.start(name, headless);
      const ip = await vmProvider.getIP(name);
      const port = await vmProvider.getSSHPort(name);
      return { title: `启动虚拟机：${name}`, output: `VM 已启动\n  - IP: ${ip}\n  - SSH 端口：${port}`, metadata: { ip, port } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `启动虚拟机失败：${name}`, output: `错误：${msg}`, metadata: { ip: "", port: 0 } };
    }
  },
}));

export const VMStopTool = Tool.define("vm_stop", async () => ({
  description: "停止虚拟机",
  parameters: VMConnectionSchema.extend({ name: z.string().describe("虚拟机名称"), force: z.boolean().default(false).describe("强制关闭") }),
  execute: async (args) => {
    const { name, force, remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      await vmProvider.create({ name, remote_host, ssh_port, ssh_username, private_key_path, password, os: "linux" });
      if (force) await vmProvider.poweroff(name); else await vmProvider.stop(name);
      return { title: `停止虚拟机：${name}`, output: `VM 已${force ? "强制" : "正常"}关闭`, metadata: {} };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `停止虚拟机失败：${name}`, output: `错误：${msg}`, metadata: {} };
    }
  },
}));

export const VMDestroyTool = Tool.define("vm_destroy", async () => ({
  description: "删除虚拟机",
  parameters: VMConnectionSchema.extend({ name: z.string().describe("虚拟机名称") }),
  execute: async (args) => {
    const { name, remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      await vmProvider.create({ name, remote_host, ssh_port, ssh_username, private_key_path, password, os: "linux" });
      await vmProvider.destroy(name);
      return { title: `删除虚拟机：${name}`, output: `VM 已删除`, metadata: {} };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `删除虚拟机失败：${name}`, output: `错误：${msg}`, metadata: {} };
    }
  },
}));

export const VMSnapshotTool = Tool.define("vm_snapshot", async () => ({
  description: "创建虚拟机快照",
  parameters: VMConnectionSchema.extend({ name: z.string().describe("虚拟机名称"), tag: z.string().describe("快照标签"), description: z.string().optional().describe("快照描述") }),
  execute: async (args) => {
    const { name, tag, description, remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      await vmProvider.create({ name, remote_host, ssh_port, ssh_username, private_key_path, password, os: "linux" });
      await vmProvider.snapshot(name, tag, description);
      return { title: `创建快照：${name} -> ${tag}`, output: `快照 "${tag}" 已创建${description ? `:\n  ${description}` : ""}`, metadata: { tag, description } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `创建快照失败：${name}`, output: `错误：${msg}`, metadata: { tag: "", description: "" as string | undefined } };
    }
  },
}));

export const VMRestoreTool = Tool.define("vm_restore", async () => ({
  description: "恢复虚拟机快照",
  parameters: VMConnectionSchema.extend({ name: z.string().describe("虚拟机名称"), tag: z.string().describe("快照标签") }),
  execute: async (args) => {
    const { name, tag, remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      await vmProvider.create({ name, remote_host, ssh_port, ssh_username, private_key_path, password, os: "linux" });
      await vmProvider.restore(name, tag);
      return { title: `恢复快照：${name} <- ${tag}`, output: `快照 "${tag}" 已恢复`, metadata: {} };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `恢复快照失败：${name}`, output: `错误：${msg}`, metadata: {} };
    }
  },
}));

export const VMExecTool = Tool.define("vm_exec", async () => ({
  description: "在虚拟机中执行命令",
  parameters: VMConnectionSchema.extend({ name: z.string().describe("虚拟机名称"), command: z.string().describe("要执行的命令") }),
  execute: async (args) => {
    const { name, command, remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      await vmProvider.create({ name, remote_host, ssh_port, ssh_username, private_key_path, password, os: "linux" });
      const result = await vmProvider.exec(name, command);
      let output = `命令执行完成\n  退出码：${result.exitCode}\n`;
      if (result.stdout) output += `\n  输出:\n${result.stdout}\n`;
      if (result.stderr) output += `\n  错误:\n${result.stderr}\n`;
      return { title: `执行命令：${command.substring(0, 50)}...`, output, metadata: result };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `执行命令失败`, output: `错误：${msg}`, metadata: { stdout: "", stderr: "", exitCode: -1 } as VMExecResult };
    }
  },
}));

export const VMUploadTool = Tool.define("vm_upload", async () => ({
  description: "上传文件到虚拟机",
  parameters: VMConnectionSchema.extend({ name: z.string().describe("虚拟机名称"), local_path: z.string().describe("本地文件路径"), remote_path: z.string().describe("远程文件路径") }),
  execute: async (args) => {
    const { name, local_path, remote_path, remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      await vmProvider.create({ name, remote_host, ssh_port, ssh_username, private_key_path, password, os: "linux" });
      await vmProvider.upload(name, local_path, remote_path);
      return { title: `上传文件：${local_path} -> ${remote_path}`, output: `文件已上传`, metadata: {} };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `上传文件失败`, output: `错误：${msg}`, metadata: {} };
    }
  },
}));

export const VMDownloadTool = Tool.define("vm_download", async () => ({
  description: "从虚拟机下载文件",
  parameters: VMConnectionSchema.extend({ name: z.string().describe("虚拟机名称"), remote_path: z.string().describe("远程文件路径"), local_path: z.string().describe("本地文件路径") }),
  execute: async (args) => {
    const { name, remote_path, local_path, remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      await vmProvider.create({ name, remote_host, ssh_port, ssh_username, private_key_path, password, os: "linux" });
      await vmProvider.download(name, remote_path, local_path);
      return { title: `下载文件：${remote_path} -> ${local_path}`, output: `文件已下载`, metadata: {} };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `下载文件失败`, output: `错误：${msg}`, metadata: {} };
    }
  },
}));

export const VMScreenshotTool = Tool.define("vm_screenshot", async () => ({
  description: "捕获虚拟机屏幕截图",
  parameters: VMConnectionSchema.extend({ name: z.string().describe("虚拟机名称"), output_path: z.string().describe("截图保存路径") }),
  execute: async (args) => {
    const { name, output_path, remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      await vmProvider.create({ name, remote_host, ssh_port, ssh_username, private_key_path, password, os: "linux" });
      const path = await vmProvider.screenshot(name, output_path);
      return { title: `截图：${name}`, output: `截图已保存到：${path}`, metadata: { path } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `截图失败`, output: `错误：${msg}`, metadata: { path: "" } };
    }
  },
}));

export const VMListTool = Tool.define("vm_list", async () => ({
  description: "列出所有虚拟机",
  parameters: VMConnectionSchema,
  execute: async (args) => {
    const { remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      await vmProvider.create({ name: "default", remote_host, ssh_port, ssh_username, private_key_path, password, os: "linux" });
      const vms = await vmProvider.list();
      if (vms.length === 0) return { title: "虚拟机列表", output: "没有找到虚拟机", metadata: { vms } };
      let output = `虚拟机列表 (${vms.length} 台):\n\n`;
      for (const vm of vms) output += `  - ${vm.name}\n    状态：${vm.status}\n`;
      return { title: `虚拟机列表 (${vms.length} 台)`, output, metadata: { vms } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: "获取虚拟机列表失败", output: `错误：${msg}`, metadata: { vms: [] as VMInstance[] } };
    }
  },
}));

export const VMStatusTool = Tool.define("vm_status", async () => ({
  description: "获取虚拟机状态",
  parameters: VMConnectionSchema.extend({ name: z.string().describe("虚拟机名称") }),
  execute: async (args) => {
    const { name, remote_host, ssh_port, ssh_username, private_key_path, password } = args;
    try {
      const vmProvider = await getVMProvider();
      await vmProvider.create({ name, remote_host, ssh_port, ssh_username, private_key_path, password, os: "linux" });
      const status = await vmProvider.getStatus(name);
      const ip = await vmProvider.getIP(name);
      const port = await vmProvider.getSSHPort(name);
      return { title: `虚拟机状态：${name}`, output: `VM 状态:\n  - 运行状态：${status}\n  - IP: ${ip}\n  - SSH 端口：${port}`, metadata: { status, ip, port } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { title: `获取状态失败：${name}`, output: `错误：${msg}`, metadata: { status: "stopped" as VMStatus, ip: "", port: 0 } };
    }
  },
}));

// 导出远程 VirtualBox 工具
export {
  VMRemoteVBoxConnectTool,
  VMRemoteVBoxDisconnectTool,
  VMRemoteVBoxStartTool,
  VMRemoteVBoxStopTool,
  VMRemoteVBoxSnapshotTool,
  VMRemoteVBoxRestoreTool,
  VMRemoteVBoxExecTool,
} from "./vm-remote-vbox";
