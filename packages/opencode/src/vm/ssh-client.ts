/**
 * SSH 客户端 - 用于与 VM 通信
 *
 * 注意：ssh2 模块需要单独安装：bun add ssh2 @types/ssh2
 */

// 动态导入 ssh2，避免类型检查错误
type SSH2Client = any;
type SSH2ClientChannel = any;
type SSH2SFTPWrapper = any;

let ssh2Module: any;
function getSSH2Module() {
  if (!ssh2Module) {
    try {
      ssh2Module = require("ssh2");
    } catch {
      throw new Error("ssh2 模块未安装，请运行：bun add ssh2 @types/ssh2");
    }
  }
  return ssh2Module;
}

const { Client } = getSSH2Module();

import { Readable } from "stream";
import { readFile, writeFile } from "fs/promises";

export interface SSHConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  privateKeyPath?: string;
  readyTimeout?: number;
  keepaliveInterval?: number;
}

export interface SSHExecResult {
  stdout: string;
  stderr: string;
  code: number;
  signal?: string;
}

export class SSHClient {
  private client: SSH2Client;
  private config: SSHConfig;
  private connected = false;

  constructor(config: SSHConfig) {
    this.config = config;
    this.client = new Client();
  }

  /**
   * 连接 SSH 服务器
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const authConfig: any = {
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        readyTimeout: this.config.readyTimeout || 30000,
        keepaliveInterval: this.config.keepaliveInterval || 60000,
      };

      if (this.config.password) {
        authConfig.password = this.config.password;
      }

      if (this.config.privateKey) {
        authConfig.privateKey = this.config.privateKey;
      }

      this.client
        .on("ready", () => {
          this.connected = true;
          resolve();
        })
        .on("error", (err: Error) => {
          this.connected = false;
          reject(new Error(`SSH 连接失败：${err.message}`));
        })
        .connect(authConfig);
    });
  }

  /**
   * 执行命令
   */
  async exec(cmd: string): Promise<SSHExecResult> {
    if (!this.connected) {
      throw new Error("SSH 未连接");
    }

    return new Promise((resolve, reject) => {
      this.client.exec(cmd, (err: Error | null, stream: SSH2ClientChannel) => {
        if (err) return reject(err);

        let stdout = "";
        let stderr = "";
        let code: number | null = null;
        let signal: string | undefined;

        stream
          .on("close", (code: number, signal: string) => {
            resolve({
              stdout,
              stderr,
              code: code ?? 0,
              signal,
            });
          })
          .on("data", (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          })
          .on("exit", (c: number, s: string) => {
            code = c;
            signal = s;
          });
      });
    });
  }

  /**
   * 上传文件
   */
  async upload(localPath: string, remotePath: string): Promise<void> {
    if (!this.connected) {
      throw new Error("SSH 未连接");
    }

    return new Promise((resolve, reject) => {
      this.client.sftp((err: Error | null, sftp: SSH2SFTPWrapper) => {
        if (err) return reject(err);

        const readStream = require("fs").createReadStream(localPath);
        const writeStream = sftp.createWriteStream(remotePath);

        writeStream
          .on("close", () => resolve())
          .on("error", (err: Error) => reject(err));

        readStream.pipe(writeStream);
      });
    });
  }

  /**
   * 下载文件
   */
  async download(remotePath: string, localPath: string): Promise<void> {
    if (!this.connected) {
      throw new Error("SSH 未连接");
    }

    return new Promise((resolve, reject) => {
      this.client.sftp((err: Error | null, sftp: SSH2SFTPWrapper) => {
        if (err) return reject(err);

        const readStream = sftp.createReadStream(remotePath);
        const writeStream = require("fs").createWriteStream(localPath);

        readStream
          .on("error", (err: Error) => reject(err))
          .pipe(writeStream)
          .on("close", resolve)
          .on("error", (err: Error) => reject(err));
      });
    });
  }

  /**
   * 读取远程文件内容
   */
  async read(remotePath: string): Promise<string> {
    if (!this.connected) {
      throw new Error("SSH 未连接");
    }

    return new Promise((resolve, reject) => {
      this.client.sftp((err: Error | null, sftp: SSH2SFTPWrapper) => {
        if (err) return reject(err);

        const chunks: Buffer[] = [];
        const readStream = sftp.createReadStream(remotePath);

        readStream
          .on("data", (chunk: Buffer) => chunks.push(chunk))
          .on("end", () => resolve(Buffer.concat(chunks).toString()))
          .on("error", (err: Error) => reject(err));
      });
    });
  }

  /**
   * 写入远程文件
   */
  async write(remotePath: string, content: string): Promise<void> {
    if (!this.connected) {
      throw new Error("SSH 未连接");
    }

    return new Promise((resolve, reject) => {
      this.client.sftp((err: Error | null, sftp: SSH2SFTPWrapper) => {
        if (err) return reject(err);

        const writeStream = sftp.createWriteStream(remotePath);

        writeStream
          .on("close", () => resolve())
          .on("error", (err: Error) => reject(err));

        writeStream.write(content);
        writeStream.end();
      });
    });
  }

  /**
   * 关闭连接
   */
  close(): void {
    if (this.connected) {
      this.client.end();
      this.connected = false;
    }
  }

  /**
   * 静态方法：快速执行单次命令
   */
  static async exec(
    host: string,
    cmd: string,
    config: Partial<SSHConfig> = {},
  ): Promise<SSHExecResult> {
    const client = new SSHClient({
      host,
      port: config.port || 22,
      username: config.username || "user",
      password: config.password,
      privateKey: config.privateKey,
      privateKeyPath: config.privateKeyPath,
    });

    try {
      await client.connect();
      return await client.exec(cmd);
    } finally {
      client.close();
    }
  }

  /**
   * 静态方法：快速上传文件
   */
  static async upload(
    host: string,
    localPath: string,
    remotePath: string,
    config: Partial<SSHConfig> = {},
  ): Promise<void> {
    const client = new SSHClient({
      host,
      port: config.port || 22,
      username: config.username || "user",
      password: config.password,
      privateKey: config.privateKey,
      privateKeyPath: config.privateKeyPath,
    });

    try {
      await client.connect();
      await client.upload(localPath, remotePath);
    } finally {
      client.close();
    }
  }

  /**
   * 静态方法：快速下载文件
   */
  static async download(
    host: string,
    remotePath: string,
    localPath: string,
    config: Partial<SSHConfig> = {},
  ): Promise<void> {
    const client = new SSHClient({
      host,
      port: config.port || 22,
      username: config.username || "user",
      password: config.password,
      privateKey: config.privateKey,
      privateKeyPath: config.privateKeyPath,
    });

    try {
      await client.connect();
      await client.download(remotePath, localPath);
    } finally {
      client.close();
    }
  }
}
