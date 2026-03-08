/**
 * 测试执行工具
 *
 * 提供在虚拟机中运行测试、模拟用户操作、收集结果等功能
 */

import { z } from "zod";
import { Tool } from "./tool";
import { getVMProvider } from "../vm/registry";
import { Log } from "@/util/log";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

const log = Log.create({ service: "tool.test" });

/**
 * Test_Run - 运行测试套件
 */
export const TestRunTool = Tool.define("test_run", async () => ({
  description: "在虚拟机中运行测试套件",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    type: z.enum(["unit", "e2e", "load", "tui", "custom"]).default("unit").describe("测试类型"),
    path: z.string().optional().describe("测试文件路径"),
    command: z.string().optional().describe("自定义测试命令 (type=custom 时使用)"),
    timeout: z.number().default(300000).describe("超时时间 (ms)"),
    workspace: z.string().default("/workspace/opencode").describe("工作目录"),
  }),
  execute: async (args) => {
    const { name, type, path, command, timeout, workspace } = args;

    const vmProvider = await getVMProvider();

    // 构建测试命令
    let testCommand: string;

    if (command && type === "custom") {
      testCommand = command;
    } else {
      const commands: Record<string, string> = {
        unit: `cd ${workspace} && bun run test`,
        e2e: `cd ${workspace}/packages/app && bunx playwright test`,
        load: `cd ${workspace} && bunx k6 run tests/load/user-simulation.js`,
        tui: `cd ${workspace} && bash tests/tui/full-test.sh`,
      };
      testCommand = commands[type] || commands.unit;
    }

    if (path) {
      testCommand += ` ${path}`;
    }

    log.info(`运行测试：${type}, 命令：${testCommand}`);

    try {
      // 执行测试
      const result = await vmProvider.exec(name, testCommand);

      // 保存结果
      const timestamp = Date.now();
      const resultPath = `logs/test-result-${timestamp}.json`;
      await mkdir(dirname(resultPath), { recursive: true });
      await writeFile(resultPath, JSON.stringify(result, null, 2));

      // 分析结果
      const hasErrors = result.stderr.toLowerCase().includes("fail") ||
        result.exitCode !== 0;

      let output = `测试执行完成\n\n`;
      output += `类型：${type}\n`;
      output += `退出码：${result.exitCode}\n`;
      output += `结果文件：${resultPath}\n\n`;

      if (result.stdout) {
        output += `=== STDOUT ===\n${result.stdout}\n\n`;
      }

      if (result.stderr) {
        output += `=== STDERR ===\n${result.stderr}\n\n`;
      }

      if (hasErrors) {
        output += `⚠ 测试发现错误或失败\n`;
      } else {
        output += `✓ 测试通过\n`;
      }

      return {
        title: `运行测试：${type}`,
        output,
        metadata: {
          type: type as "unit" | "e2e" | "load" | "tui" | "custom",
          exitCode: result.exitCode,
          hasErrors,
          resultPath,
        },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `运行测试失败`,
        output: `错误：${msg}`,
        metadata: {
          type: type as "unit" | "e2e" | "load" | "tui" | "custom",
          exitCode: -1,
          hasErrors: true,
          resultPath: "",
        },
      };
    }
  },
}));

/**
 * Test_Simulate - 模拟用户操作
 */
export const TestSimulateTool = Tool.define("test_simulate", async () => ({
  description: "模拟用户在 TUI 中的操作序列",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    session: z.string().default("opencode-test").describe("tmux 会话名称"),
    actions: z.array(
      z.object({
        type: z.enum(["type", "key", "wait", "capture"]),
        value: z.string().optional().describe("输入值或键名"),
        delay: z.number().default(1000).describe("延迟 (ms)"),
      })
    ).describe("操作序列"),
    workspace: z.string().default("/workspace/opencode").describe("工作目录"),
  }),
  execute: async (args) => {
    const { name, session, actions, workspace } = args;
    const vmProvider = await getVMProvider();

    const results: any[] = [];
    const logs: string[] = [];

    try {
      // 1. 创建 tmux 会话并启动应用
      logs.push(`创建 tmux 会话：${session}`);
      await vmProvider.exec(name, `tmux new-session -d -s ${session} -x 120 -y 40`);
      await vmProvider.exec(name, `tmux send-keys -t ${session} "cd ${workspace} && bun dev" C-m`);

      // 等待应用启动
      logs.push("等待应用启动...");
      await sleep(5000);

      // 捕获初始状态
      const initialOutput = await vmProvider.exec(name, `tmux capture-pane -t ${session} -p -S -1000`);
      results.push({ step: "init", output: initialOutput.stdout });
      logs.push("应用已启动");

      // 2. 执行操作序列
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        logs.push(`执行操作 ${i + 1}/${actions.length}: ${action.type}`);

        await sleep(action.delay);

        if (action.type === "type") {
          logs.push(`输入：${action.value}`);
          await vmProvider.exec(name, `tmux send-keys -t ${session} "${action.value}" C-m`);
          results.push({ step: i, action: "type", value: action.value });
        }

        if (action.type === "key") {
          logs.push(`按键：${action.value}`);
          await vmProvider.exec(name, `tmux send-keys -t ${session} "${action.value}"`);
          results.push({ step: i, action: "key", value: action.value });
        }

        if (action.type === "wait") {
          logs.push(`等待 ${action.delay}ms`);
          results.push({ step: i, action: "wait", delay: action.delay });
        }

        if (action.type === "capture") {
          const output = await vmProvider.exec(name, `tmux capture-pane -t ${session} -p -S -1000`);
          results.push({ step: i, action: "capture", output: output.stdout });
          logs.push("已捕获终端输出");
        }
      }

      // 3. 最终捕获
      const finalOutput = await vmProvider.exec(name, `tmux capture-pane -t ${session} -p -S -1000`);
      results.push({ step: "final", output: finalOutput.stdout });

      // 4. 保存结果
      const timestamp = Date.now();
      const resultPath = `logs/simulate-result-${timestamp}.json`;
      const logPath = `logs/simulate-log-${timestamp}.txt`;

      await mkdir(dirname(resultPath), { recursive: true });
      await writeFile(resultPath, JSON.stringify(results, null, 2));
      await writeFile(logPath, logs.join("\n"));

      // 5. 清理 tmux 会话
      await vmProvider.exec(name, `tmux kill-session -t ${session}`);

      let output = `模拟用户操作完成\n\n`;
      output += `执行了 ${actions.length} 个操作\n`;
      output += `结果文件：${resultPath}\n`;
      output += `日志文件：${logPath}\n\n`;

      // 显示最终输出摘要
      if (finalOutput.stdout) {
        const lines = finalOutput.stdout.split("\n");
        output += `=== 最终输出 (最后 20 行) ===\n`;
        output += lines.slice(-20).join("\n");
      }

      return {
        title: `模拟用户操作 (${actions.length} 步)`,
        output,
        metadata: {
          actions: actions.length,
          results,
          resultPath,
          logPath,
        },
      };
    } catch (error: unknown) {
      // 清理 tmux 会话
      try {
        await vmProvider.exec(name, `tmux kill-session -t ${session}`);
      } catch {
        // 忽略
      }

      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `模拟用户操作失败`,
        output: `错误：${msg}\n\n日志:\n${logs.join("\n")}`,
        metadata: {
          actions: actions.length,
          results: [],
          resultPath: "",
          logPath: "",
        },
      };
    }
  },
}));

/**
 * Test_Collect - 收集测试结果
 */
export const TestCollectTool = Tool.define("test_collect", async () => ({
  description: "从虚拟机收集测试结果（日志、截图、性能数据）",
  parameters: z.object({
    name: z.string().describe("虚拟机名称"),
    type: z.enum(["logs", "screenshots", "metrics", "all"]).default("all").describe("收集类型"),
    log_paths: z.array(z.string()).optional().describe("日志文件路径列表"),
    output_dir: z.string().default("results").describe("输出目录"),
    workspace: z.string().default("/workspace/opencode").describe("工作目录"),
  }),
  execute: async (args) => {
    const { name, type, log_paths, output_dir, workspace } = args;
    const vmProvider = await getVMProvider();

    const timestamp = Date.now();
    const collected: { type: string; path: string; size?: number }[] = [];
    const logs: string[] = [];

    try {
      // 收集日志
      if (type === "all" || type === "logs") {
        logs.push("收集日志文件...");

        const paths = log_paths || [
          `${workspace}/logs/*.log`,
          `${workspace}/packages/app/playwright-report/**/*.html`,
          `/var/log/opencode/*.log`,
        ];

        for (const pattern of paths) {
          try {
            const { stdout } = await vmProvider.exec(name, `ls -la ${pattern} 2>/dev/null || echo "no matches"`);
            if (!stdout.includes("no matches") && stdout.trim()) {
              const files = stdout.trim().split("\n");
              for (const file of files) {
                const fileName = file.split("/").pop();
                if (fileName) {
                  const localPath = `${output_dir}/logs/${timestamp}-${fileName}`;
                  try {
                    await vmProvider.download(name, file.trim(), localPath);
                    collected.push({ type: "log", path: localPath });
                    logs.push(`已收集：${file.trim()}`);
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    logs.push(`下载失败 ${file.trim()}: ${msg}`);
                  }
                }
              }
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            logs.push(`列举文件失败 ${pattern}: ${msg}`);
          }
        }
      }

      // 收集截图
      if (type === "all" || type === "screenshots") {
        logs.push("收集截图...");

        try {
          // 尝试捕获当前屏幕
          const screenshotPath = `${output_dir}/screenshots/${timestamp}-screen.png`;
          await vmProvider.screenshot(name, screenshotPath);
          collected.push({ type: "screenshot", path: screenshotPath });
          logs.push("已收集屏幕截图");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logs.push(`截图失败：${msg}`);
        }

        // 下载已有截图
        try {
          const { stdout } = await vmProvider.exec(name, `find ${workspace}/screenshots -name "*.png" 2>/dev/null`);
          const files = stdout.trim().split("\n").filter(Boolean);
          for (const file of files) {
            const fileName = file.split("/").pop();
            if (fileName) {
              const localPath = `${output_dir}/screenshots/${timestamp}-${fileName}`;
              try {
                await vmProvider.download(name, file, localPath);
                collected.push({ type: "screenshot", path: localPath });
                logs.push(`已收集：${file}`);
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                logs.push(`下载截图失败 ${file}: ${msg}`);
              }
            }
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logs.push(`查找截图失败：${msg}`);
        }
      }

      // 收集性能指标
      if (type === "all" || type === "metrics") {
        logs.push("收集性能指标...");

        try {
          // 获取系统信息
          const sysInfo = await vmProvider.exec(name, `uptime && free -h && df -h`);
          const sysPath = `${output_dir}/metrics/${timestamp}-system.txt`;
          await mkdir(dirname(sysPath), { recursive: true });
          await writeFile(sysPath, sysInfo.stdout);
          collected.push({ type: "metric", path: sysPath });
          logs.push("已收集系统指标");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logs.push(`收集系统指标失败：${msg}`);
        }

        try {
          // 获取进程信息
          const procInfo = await vmProvider.exec(name, `ps aux --sort=-%mem | head -20`);
          const procPath = `${output_dir}/metrics/${timestamp}-process.txt`;
          await writeFile(procPath, procInfo.stdout);
          collected.push({ type: "metric", path: procPath });
          logs.push("已收集进程信息");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logs.push(`收集进程信息失败：${msg}`);
        }
      }

      // 生成收集报告
      const reportPath = `${output_dir}/${timestamp}-collection-report.txt`;
      let report = `测试数据收集报告\n`;
      report += `==================\n\n`;
      report += `时间：${new Date(timestamp).toISOString()}\n`;
      report += `虚拟机：${name}\n`;
      report += `收集类型：${type}\n\n`;
      report += `收集的文件 (${collected.length}):\n`;
      for (const item of collected) {
        report += `  - [${item.type}] ${item.path}\n`;
      }
      report += `\n收集日志:\n${logs.join("\n")}\n`;

      await writeFile(reportPath, report);
      collected.push({ type: "report", path: reportPath });

      let output = `测试数据收集完成\n\n`;
      output += `收集了 ${collected.length} 个文件\n`;
      output += `报告文件：${reportPath}\n\n`;

      if (collected.length > 0) {
        output += `文件列表:\n`;
        for (const item of collected) {
          output += `  - ${item.path}\n`;
        }
      }

      return {
        title: `收集测试结果 (${collected.length} 个文件)`,
        output,
        metadata: {
          collected,
          reportPath,
          logs,
        },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        title: `收集测试结果失败`,
        output: `错误：${msg}\n\n日志:\n${logs.join("\n")}`,
        metadata: {
          collected: [],
          reportPath: "",
          logs,
        },
      };
    }
  },
}));

// 辅助函数
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
