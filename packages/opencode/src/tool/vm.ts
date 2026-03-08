/**
 * VM 管理工具
 *
 * 提供虚拟机的创建、启动、停止、快照、文件传输等功能
 */

import { z } from "zod";
import { Tool } from "./tool";
import { getVMProvider } from "../vm/registry";
import { Log } from "@/util/log";

const log = Log.create({ service: "tool.vm" });

/**
 * VM_Create - 创建虚拟机
 */
export const VMCreateTool = Tool.define("vm_create", async () => ({
  description: "创建虚拟机 (支持 VirtualBox/Docker/WSL)",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    os: z.string().default("ubuntu-22.04").describe("操作系统类型"),
    cpu: z.number().default(2).describe("CPU 核心数"),
    memory: z.string().default("4096").describe("内存大小 (MB)"),
    disk: z.string().default("20G").describe("磁盘大小"),
    provider: z.enum(["auto", "virtualbox", "docker", "wsl"]).default("auto").describe("VM 提供者"),
  }),
  execute: async (args) => {
    const { name, os, cpu, memory, disk, provider } = args;

    try {
      const vmProvider = await getVMProvider();

      // 创建 VM
      const vm = await vmProvider.create({
        name,
        os,
        cpu,
        memory: `${memory}M`,
        disk,
      });

      return {
        title: `创建虚拟机：${name}`,
        output: `虚拟机 "${name}" 已创建成功\n` +
          `  - 提供者：${vm.provider}\n` +
          `  - 状态：${vm.status}\n` +
          `  - 操作系统：${os}\n` +
          `  - CPU: ${cpu} 核心\n` +
          `  - 内存：${memory}MB\n` +
          `  - 磁盘：${disk}`,
        metadata: { vm },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `创建虚拟机失败：${name}`,
        output: `错误：${msg}`,
        metadata: { vm: undefined as any },
      };
    }
  },
}));

/**
 * VM_Start - 启动虚拟机
 */
export const VMStartTool = Tool.define("vm_start", async () => ({
  description: "启动虚拟机",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    headless: z.boolean().default(true).describe("是否无头模式启动"),
  }),
  execute: async (args) => {
    const { name, headless } = args;

    try {
      const vmProvider = await getVMProvider();
      await vmProvider.start(name, headless);

      const ip = await vmProvider.getIP(name);
      const sshPort = await vmProvider.getSSHPort(name);

      return {
        title: `启动虚拟机：${name}`,
        output: `虚拟机 "${name}" 已启动\n` +
          `  - IP: ${ip}\n` +
          `  - SSH 端口：${sshPort || "N/A (使用内部连接)"}`,
        metadata: { ip, sshPort },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `启动虚拟机失败：${name}`,
        output: `错误：${msg}`,
        metadata: { ip: undefined as any, sshPort: undefined as any },
      };
    }
  },
}));

/**
 * VM_Stop - 停止虚拟机
 */
export const VMStopTool = Tool.define("vm_stop", async () => ({
  description: "停止虚拟机",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    force: z.boolean().default(false).describe("是否强制关闭"),
  }),
  execute: async (args) => {
    const { name, force } = args;

    try {
      const vmProvider = await getVMProvider();

      if (force) {
        await vmProvider.poweroff(name);
      } else {
        await vmProvider.stop(name);
      }

      return {
        title: `停止虚拟机：${name}`,
        output: `虚拟机 "${name}" 已${force ? "强制" : "正常"}关闭`,
        metadata: {},
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `停止虚拟机失败：${name}`,
        output: `错误：${msg}`,
        metadata: {},
      };
    }
  },
}));

/**
 * VM_Destroy - 删除虚拟机
 */
export const VMDestroyTool = Tool.define("vm_destroy", async () => ({
  description: "删除虚拟机",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
  }),
  execute: async (args) => {
    const { name } = args;

    try {
      const vmProvider = await getVMProvider();
      await vmProvider.destroy(name);

      return {
        title: `删除虚拟机：${name}`,
        output: `虚拟机 "${name}" 已删除`,
        metadata: {},
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `删除虚拟机失败：${name}`,
        output: `错误：${msg}`,
        metadata: {},
      };
    }
  },
}));

/**
 * VM_Snapshot - 创建快照
 */
export const VMSnapshotTool = Tool.define("vm_snapshot", async () => ({
  description: "创建虚拟机快照",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    tag: z.string().describe("快照标签"),
    description: z.string().optional().describe("快照描述"),
  }),
  execute: async (args) => {
    const { name, tag, description } = args;

    try {
      const vmProvider = await getVMProvider();
      await vmProvider.snapshot(name, tag, description);

      return {
        title: `创建快照：${name} -> ${tag}`,
        output: `快照 "${tag}" 已创建${description ? `:\n  ${description}` : ""}`,
        metadata: { tag, description },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `创建快照失败：${name}`,
        output: `错误：${msg}`,
        metadata: { tag: undefined as any, description: undefined as any },
      };
    }
  },
}));

/**
 * VM_Restore - 恢复快照
 */
export const VMRestoreTool = Tool.define("vm_restore", async () => ({
  description: "恢复虚拟机快照",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    tag: z.string().describe("快照标签"),
  }),
  execute: async (args) => {
    const { name, tag } = args;

    try {
      const vmProvider = await getVMProvider();
      await vmProvider.restore(name, tag);

      return {
        title: `恢复快照：${name} <- ${tag}`,
        output: `快照 "${tag}" 已恢复，虚拟机已重启`,
        metadata: {},
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `恢复快照失败：${name}`,
        output: `错误：${msg}`,
        metadata: {},
      };
    }
  },
}));

/**
 * VM_Exec - 执行命令
 */
export const VMExecTool = Tool.define("vm_exec", async () => ({
  description: "在虚拟机中执行命令",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    command: z.string().describe("要执行的命令"),
  }),
  execute: async (args) => {
    const { name, command } = args;

    try {
      const vmProvider = await getVMProvider();
      const result = await vmProvider.exec(name, command);

      let output = "";
      if (result.stdout) output += `$ stdout:\n${result.stdout}\n`;
      if (result.stderr) output += `$ stderr:\n${result.stderr}\n`;
      output += `退出码：${result.exitCode}`;

      return {
        title: `执行命令：${command.substring(0, 50)}...`,
        output: output || "命令执行完成 (无输出)",
        metadata: result,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `执行命令失败：${command}`,
        output: `错误：${msg}`,
        metadata: {},
      };
    }
  },
}));

/**
 * VM_Upload - 上传文件
 */
export const VMUploadTool = Tool.define("vm_upload", async () => ({
  description: "上传文件到虚拟机",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    local_path: z.string().describe("本地文件路径"),
    remote_path: z.string().describe("远程文件路径"),
  }),
  execute: async (args) => {
    const { name, local_path, remote_path } = args;

    try {
      const vmProvider = await getVMProvider();
      await vmProvider.upload(name, local_path, remote_path);

      return {
        title: `上传文件：${local_path} -> ${remote_path}`,
        output: `文件已上传到虚拟机:\n  本地：${local_path}\n  远程：${remote_path}`,
        metadata: {},
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `上传文件失败`,
        output: `错误：${msg}`,
        metadata: {},
      };
    }
  },
}));

/**
 * VM_Download - 下载文件
 */
export const VMDownloadTool = Tool.define("vm_download", async () => ({
  description: "从虚拟机下载文件",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    remote_path: z.string().describe("远程文件路径"),
    local_path: z.string().describe("本地文件路径"),
  }),
  execute: async (args) => {
    const { name, remote_path, local_path } = args;

    try {
      const vmProvider = await getVMProvider();
      await vmProvider.download(name, remote_path, local_path);

      return {
        title: `下载文件：${remote_path} -> ${local_path}`,
        output: `文件已从虚拟机下载:\n  远程：${remote_path}\n  本地：${local_path}`,
        metadata: {},
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `下载文件失败`,
        output: `错误：${msg}`,
        metadata: {},
      };
    }
  },
}));

/**
 * VM_Screenshot - 截图
 */
export const VMScreenshotTool = Tool.define("vm_screenshot", async () => ({
  description: "捕获虚拟机屏幕截图 (仅支持 VirtualBox)",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    output_path: z.string().describe("截图保存路径"),
  }),
  execute: async (args) => {
    const { name, output_path } = args;

    try {
      const vmProvider = await getVMProvider();
      const path = await vmProvider.screenshot(name, output_path);

      return {
        title: `截图：${name}`,
        output: `截图已保存到：${path}`,
        metadata: { path },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `截图失败`,
        output: `错误：${msg}`,
        metadata: { path: undefined as any },
      };
    }
  },
}));

/**
 * VM_List - 列出所有虚拟机
 */
export const VMListTool = Tool.define("vm_list", async () => ({
  description: "列出所有虚拟机",
  parameters: z.object({}),
  execute: async () => {
    try {
      const vmProvider = await getVMProvider();
      const vms = await vmProvider.list();

      if (vms.length === 0) {
        return {
          title: "虚拟机列表",
          output: "没有找到虚拟机",
          metadata: { vms: [] },
        };
      }

      let output = "虚拟机列表:\n\n";
      for (const vm of vms) {
        output += `  - ${vm.name}\n`;
        output += `    状态：${vm.status}\n`;
        output += `    提供者：${vm.provider}\n`;
        if (vm.capabilities) {
          output += `    能力：`;
          const caps = [];
          if (vm.capabilities.snapshot) caps.push("快照");
          if (vm.capabilities.screenshot) caps.push("截图");
          if (vm.capabilities.gui) caps.push("GUI");
          output += caps.join(", ") + "\n";
        }
      }

      return {
        title: `虚拟机列表 (${vms.length} 台)`,
        output,
        metadata: { vms },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: "获取虚拟机列表失败",
        output: `错误：${msg}`,
        metadata: { vms: undefined as any },
      };
    }
  },
}));

/**
 * VM_Status - 获取虚拟机状态
 */
export const VMStatusTool = Tool.define("vm_status", async () => ({
  description: "获取虚拟机状态",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
  }),
  execute: async (args) => {
    const { name } = args;

    try {
      const vmProvider = await getVMProvider();
      const status = await vmProvider.getStatus(name);
      const ip = await vmProvider.getIP(name);
      const sshPort = await vmProvider.getSSHPort(name);

      return {
        title: `虚拟机状态：${name}`,
        output: `虚拟机 "${name}" 状态:\n` +
          `  - 运行状态：${status}\n` +
          `  - IP 地址：${ip}\n` +
          `  - SSH 端口：${sshPort || "N/A"}`,
        metadata: { status, ip, sshPort },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `获取状态失败：${name}`,
        output: `错误：${msg}`,
        metadata: { status: undefined as any, ip: undefined as any, sshPort: undefined as any },
      };
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
