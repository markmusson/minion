import { Sandbox } from "@vercel/sandbox";
import * as fs from "fs";
import * as path from "path";

/**
 * Minion — On-demand OpenClaw agent execution on Vercel Sandbox
 * 
 * Uses Firecracker microVMs (50ms startup), snapshots for fast resume,
 * VERCEL_OIDC_TOKEN for auth (zero hardcoded secrets).
 * 
 * Pay only for active CPU time.
 */

export interface MinionConfig {
  snapshotId?: string; // Resume from snapshot (faster)
  timeout?: number;
  env?: Record<string, string>;
}

export interface MinionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  sandboxId: string;
}

export class Minion {
  private sandbox: Sandbox | null = null;
  private config: MinionConfig;

  constructor(config: MinionConfig = {}) {
    this.config = config;
  }

  /**
   * Create a new sandbox, optionally from snapshot.
   * Snapshot contains pre-installed OpenClaw for instant startup.
   */
  async create(): Promise<string> {
    const options: any = {
      environment: {
        NODE_ENV: "production",
        ...this.config.env,
      },
    };

    // Resume from snapshot if available (instant startup)
    if (this.config.snapshotId) {
      options.snapshotId = this.config.snapshotId;
    }

    this.sandbox = await Sandbox.create(options);
    console.log(`✅ Minion sandbox created: ${this.sandbox.id}`);
    return this.sandbox.id;
  }

  /**
   * Run a task in the sandbox.
   * If no snapshot, installs OpenClaw first.
   */
  async runTask(
    command: string,
    args: string[] = [],
    env: Record<string, string> = {}
  ): Promise<MinionResult> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized. Call create() first.");
    }

    const startTime = Date.now();

    try {
      // If no snapshot, bootstrap OpenClaw
      if (!this.config.snapshotId) {
        console.log("📦 Installing OpenClaw...");
        await this.sandbox.runCommand("npm", [
          "install",
          "-g",
          "openclaw@2026.3.2-beta.1",
        ]);
      }

      // Run the task
      const fullEnv = { ...this.config.env, ...env };
      const cmd = await this.sandbox.runCommand(command, args, {
        env: fullEnv,
        timeout: this.config.timeout || 300000, // 5m default
      });

      const stdout = await cmd.stdout();
      const stderr = await cmd.stderr();
      const exitCode = cmd.exitCode();

      return {
        stdout,
        stderr,
        exitCode,
        duration: Date.now() - startTime,
        sandboxId: this.sandbox.id,
      };
    } catch (error) {
      throw new Error(`Task failed: ${error}`);
    }
  }

  /**
   * Save sandbox state as a snapshot for fast resume.
   */
  async snapshot(name: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized. Call create() first.");
    }

    const snapshotId = await this.sandbox.snapshot();
    console.log(`✅ Snapshot saved: ${snapshotId} (${name})`);
    return snapshotId;
  }

  /**
   * Stop the sandbox and cleanup.
   */
  async stop(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.stop();
      this.sandbox = null;
      console.log(`✅ Minion sandbox stopped`);
    }
  }

  getSandboxId(): string | null {
    return this.sandbox?.id || null;
  }
}

/**
 * High-level API: run an OpenClaw agent task in a minion sandbox.
 */
export async function runAgentOnMinion(
  agentId: string,
  taskPrompt: string,
  snapshotId?: string
): Promise<MinionResult> {
  const config: MinionConfig = { snapshotId };
  const minion = new Minion(config);
  await minion.create();

  try {
    const result = await minion.runTask("openclaw", ["run", agentId], {
      AGENT_TASK: taskPrompt,
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN || "",
    });

    console.log(`\n🎯 Agent (${agentId}) completed in ${result.duration}ms`);
    return result;
  } finally {
    await minion.stop();
  }
}
