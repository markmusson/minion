import { Sandbox } from "@vercel/sandbox";

/**
 * Minion — On-demand OpenClaw execution on Vercel Sandbox
 * 
 * Spawn isolated Linux environments for agent tasks.
 * Pay only for active CPU time, not idle.
 */

export interface MinionTask {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export interface MinionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export class Minion {
  private sandbox: Sandbox | null = null;

  async create(): Promise<void> {
    this.sandbox = await Sandbox.create();
    console.log(`✅ Minion sandbox created`);
  }

  async runTask(task: MinionTask): Promise<MinionResult> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized. Call create() first.");
    }

    const startTime = Date.now();

    try {
      // Install OpenClaw in sandbox
      await this.sandbox.runCommand("npm", [
        "install",
        "-g",
        "openclaw@2026.3.2-beta.1",
      ]);

      // Run the task
      const cmd = await this.sandbox.runCommand(task.command, task.args || []);
      const stdout = await cmd.stdout();
      const stderr = await cmd.stderr();
      const exitCode = cmd.exitCode;

      return {
        stdout,
        stderr,
        exitCode,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(`Task failed: ${error}`);
    }
  }

  async stop(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.stop();
      this.sandbox = null;
      console.log(`✅ Minion sandbox stopped`);
    }
  }
}

// Example: spawn OpenClaw agent in sandbox
export async function runAgentTask(agentId: string, taskPrompt: string) {
  const minion = new Minion();
  await minion.create();

  try {
    const result = await minion.runTask({
      command: "openclaw",
      args: ["run", agentId],
      env: {
        AGENT_TASK: taskPrompt,
      },
    });

    console.log(`Agent output:\n${result.stdout}`);
    return result;
  } finally {
    await minion.stop();
  }
}
