import { exec } from 'node:child_process';

import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import type { ExecuteOutput, Rule, RuleType, ShellPluginOptions } from '../schemas/schemas.js';
import { database } from '../database/database.js';

type CommandCheck =
  | { allowed: true }
  | { allowed: false; denied: true; pattern: string }
  | { allowed: false; denied: false };

class ShellService {
  #services: Services;
  #options: Required<ShellPluginOptions>;

  constructor(services: Services) {
    this.#services = services;
    this.#options = {
      timeout: 30_000,
      maxOutputLength: 50_000,
      shell: '/bin/sh',
      cwd: process.cwd(),
    };
  }

  configure = (options: ShellPluginOptions) => {
    this.#options = {
      timeout: options.timeout ?? 30_000,
      maxOutputLength: options.maxOutputLength ?? 50_000,
      shell: options.shell ?? '/bin/sh',
      cwd: options.cwd ?? process.cwd(),
    };
  };

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    const db = await databaseService.get(database);
    return db;
  };

  #patternToRegex = (pattern: string): RegExp => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const withWildcards = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${withWildcards}$`);
  };

  checkCommand = async (userId: string, command: string): Promise<CommandCheck> => {
    const rules = await this.listRules(userId);

    for (const rule of rules) {
      if (rule.type === 'deny' && this.#patternToRegex(rule.pattern).test(command)) {
        return { allowed: false, denied: true, pattern: rule.pattern };
      }
    }

    for (const rule of rules) {
      if (rule.type === 'allow' && this.#patternToRegex(rule.pattern).test(command)) {
        return { allowed: true };
      }
    }

    return { allowed: false, denied: false };
  };

  addRule = async (userId: string, pattern: string, type: RuleType): Promise<boolean> => {
    const db = await this.#getDb();
    const existing = await db
      .selectFrom('shell_rules')
      .select('pattern')
      .where('user_id', '=', userId)
      .where('pattern', '=', pattern)
      .executeTakeFirst();
    if (existing) return false;

    await db
      .insertInto('shell_rules')
      .values({
        user_id: userId,
        pattern,
        type,
        created_at: new Date().toISOString(),
      })
      .execute();
    return true;
  };

  removeRule = async (userId: string, pattern: string): Promise<boolean> => {
    const db = await this.#getDb();
    const result = await db
      .deleteFrom('shell_rules')
      .where('user_id', '=', userId)
      .where('pattern', '=', pattern)
      .execute();
    return result.length > 0 && Number(result[0].numDeletedRows) > 0;
  };

  listRules = async (userId: string): Promise<Rule[]> => {
    const db = await this.#getDb();
    const rows = await db
      .selectFrom('shell_rules')
      .select(['pattern', 'type'])
      .where('user_id', '=', userId)
      .orderBy('pattern', 'asc')
      .execute();
    return rows.map((r) => ({ pattern: r.pattern, type: r.type as RuleType }));
  };

  execute = async (options: {
    userId: string;
    command: string;
    cwd?: string;
    timeout?: number;
    force?: boolean;
  }): Promise<ExecuteOutput> => {
    if (!options.force) {
      const check = await this.checkCommand(options.userId, options.command);
      if (!check.allowed) {
        if (check.denied) {
          throw new Error(`Command "${options.command}" is blocked by deny rule "${check.pattern}".`);
        }
        throw new Error(
          `Command "${options.command}" does not match any allowed pattern. Use shell.add-rule to add a pattern before executing.`,
        );
      }
    }

    const timeout = options.timeout ?? this.#options.timeout;
    const cwd = options.cwd ?? this.#options.cwd;
    const maxOutputLength = this.#options.maxOutputLength;

    const start = Date.now();

    const { exitCode, stdout, stderr } = await new Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
    }>((resolve) => {
      exec(
        options.command,
        {
          timeout,
          cwd,
          shell: this.#options.shell,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          resolve({
            exitCode: error?.code ?? (typeof error?.code === 'number' ? error.code : 0),
            stdout,
            stderr,
          });
        },
      );
    });

    const durationMs = Date.now() - start;

    const combinedLength = stdout.length + stderr.length;
    let truncated = false;
    let finalStdout = stdout;
    let finalStderr = stderr;

    if (combinedLength > maxOutputLength) {
      truncated = true;
      const halfMax = Math.floor(maxOutputLength / 2);
      finalStdout = stdout.slice(0, halfMax);
      finalStderr = stderr.slice(0, halfMax);
    }

    return {
      command: options.command,
      exitCode,
      stdout: finalStdout,
      stderr: finalStderr,
      truncated,
      durationMs,
    };
  };
}

export { ShellService };
export type { CommandCheck };
