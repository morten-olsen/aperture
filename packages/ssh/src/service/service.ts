import { generateKeyPairSync } from 'node:crypto';

import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { Client } from 'ssh2';

import type { ExecuteOutput, Host, Rule, RuleType, SshPluginOptions } from '../schemas/schemas.js';
import { database } from '../database/database.js';

type CommandCheck =
  | { allowed: true }
  | { allowed: false; denied: true; pattern: string; host: string }
  | { allowed: false; denied: false };

class SshService {
  #services: Services;
  #options: Required<SshPluginOptions>;

  constructor(services: Services) {
    this.#services = services;
    this.#options = {
      timeout: 30_000,
      maxOutputLength: 50_000,
    };
  }

  configure = (options: SshPluginOptions) => {
    this.#options = {
      timeout: options.timeout ?? 30_000,
      maxOutputLength: options.maxOutputLength ?? 50_000,
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

  #generateKeyPair = (): { privateKey: string; publicKey: string } => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    const rawPublicKey = spkiDer.subarray(12);

    const keyType = Buffer.from('ssh-ed25519');
    const typeLen = Buffer.alloc(4);
    typeLen.writeUInt32BE(keyType.length);
    const keyLen = Buffer.alloc(4);
    keyLen.writeUInt32BE(rawPublicKey.length);
    const blob = Buffer.concat([typeLen, keyType, keyLen, rawPublicKey]);

    return {
      privateKey: privateKeyPem,
      publicKey: `ssh-ed25519 ${blob.toString('base64')}`,
    };
  };

  getOrCreateKeyPair = async (userId: string): Promise<{ privateKey: string; publicKey: string }> => {
    const db = await this.#getDb();
    const existing = await db
      .selectFrom('ssh_keypairs')
      .select(['private_key', 'public_key'])
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (existing) {
      return { privateKey: existing.private_key, publicKey: existing.public_key };
    }

    const keyPair = this.#generateKeyPair();
    await db
      .insertInto('ssh_keypairs')
      .values({
        user_id: userId,
        private_key: keyPair.privateKey,
        public_key: keyPair.publicKey,
        created_at: new Date().toISOString(),
      })
      .execute();

    return keyPair;
  };

  addHost = async (
    userId: string,
    host: { id: string; hostname: string; port?: number; username: string },
  ): Promise<boolean> => {
    const db = await this.#getDb();
    const existing = await db
      .selectFrom('ssh_hosts')
      .select('id')
      .where('user_id', '=', userId)
      .where('id', '=', host.id)
      .executeTakeFirst();
    if (existing) return false;

    await db
      .insertInto('ssh_hosts')
      .values({
        user_id: userId,
        id: host.id,
        hostname: host.hostname,
        port: String(host.port ?? 22),
        username: host.username,
        created_at: new Date().toISOString(),
      })
      .execute();
    return true;
  };

  removeHost = async (userId: string, id: string): Promise<boolean> => {
    const db = await this.#getDb();
    const result = await db.deleteFrom('ssh_hosts').where('user_id', '=', userId).where('id', '=', id).execute();
    return result.length > 0 && Number(result[0].numDeletedRows) > 0;
  };

  getHost = async (userId: string, id: string): Promise<Host | undefined> => {
    const db = await this.#getDb();
    const row = await db
      .selectFrom('ssh_hosts')
      .select(['id', 'hostname', 'port', 'username'])
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return undefined;
    return { id: row.id, hostname: row.hostname, port: Number(row.port), username: row.username };
  };

  listHosts = async (userId: string): Promise<Host[]> => {
    const db = await this.#getDb();
    const rows = await db
      .selectFrom('ssh_hosts')
      .select(['id', 'hostname', 'port', 'username'])
      .where('user_id', '=', userId)
      .orderBy('id', 'asc')
      .execute();
    return rows.map((r) => ({ id: r.id, hostname: r.hostname, port: Number(r.port), username: r.username }));
  };

  addRule = async (userId: string, pattern: string, host: string, type: RuleType): Promise<boolean> => {
    const db = await this.#getDb();
    const existing = await db
      .selectFrom('ssh_rules')
      .select('pattern')
      .where('user_id', '=', userId)
      .where('pattern', '=', pattern)
      .where('host', '=', host)
      .executeTakeFirst();
    if (existing) return false;

    await db
      .insertInto('ssh_rules')
      .values({
        user_id: userId,
        pattern,
        host,
        type,
        created_at: new Date().toISOString(),
      })
      .execute();
    return true;
  };

  removeRule = async (userId: string, pattern: string, host: string): Promise<boolean> => {
    const db = await this.#getDb();
    const result = await db
      .deleteFrom('ssh_rules')
      .where('user_id', '=', userId)
      .where('pattern', '=', pattern)
      .where('host', '=', host)
      .execute();
    return result.length > 0 && Number(result[0].numDeletedRows) > 0;
  };

  listRules = async (userId: string): Promise<Rule[]> => {
    const db = await this.#getDb();
    const rows = await db
      .selectFrom('ssh_rules')
      .select(['pattern', 'host', 'type'])
      .where('user_id', '=', userId)
      .orderBy('pattern', 'asc')
      .execute();
    return rows.map((r) => ({ pattern: r.pattern, host: r.host, type: r.type as RuleType }));
  };

  checkCommand = async (userId: string, hostId: string, command: string): Promise<CommandCheck> => {
    const rules = await this.listRules(userId);

    for (const rule of rules) {
      if (
        rule.type === 'deny' &&
        this.#patternToRegex(rule.pattern).test(command) &&
        this.#patternToRegex(rule.host).test(hostId)
      ) {
        return { allowed: false, denied: true, pattern: rule.pattern, host: rule.host };
      }
    }

    for (const rule of rules) {
      if (
        rule.type === 'allow' &&
        this.#patternToRegex(rule.pattern).test(command) &&
        this.#patternToRegex(rule.host).test(hostId)
      ) {
        return { allowed: true };
      }
    }

    return { allowed: false, denied: false };
  };

  execute = async (options: {
    userId: string;
    hostId: string;
    command: string;
    timeout?: number;
    force?: boolean;
  }): Promise<ExecuteOutput> => {
    if (!options.force) {
      const check = await this.checkCommand(options.userId, options.hostId, options.command);
      if (!check.allowed) {
        if (check.denied) {
          throw new Error(
            `Command "${options.command}" on host "${options.hostId}" is blocked by deny rule "${check.pattern}" / "${check.host}".`,
          );
        }
        throw new Error(
          `Command "${options.command}" on host "${options.hostId}" does not match any allowed rule. Use ssh.add-rule to add a rule before executing.`,
        );
      }
    }

    const host = await this.getHost(options.userId, options.hostId);
    if (!host) {
      throw new Error(`Host "${options.hostId}" not found. Use ssh.add-host to add it first.`);
    }

    const keyPair = await this.getOrCreateKeyPair(options.userId);
    const timeout = options.timeout ?? this.#options.timeout;
    const maxOutputLength = this.#options.maxOutputLength;

    const start = Date.now();

    const { exitCode, stdout, stderr } = await new Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const client = new Client();

      const timer = setTimeout(() => {
        client.end();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      client.on('ready', () => {
        client.exec(options.command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            client.end();
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });
          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
          stream.on('close', (code: number | null) => {
            clearTimeout(timer);
            client.end();
            resolve({ exitCode: code ?? 0, stdout, stderr });
          });
        });
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      client.connect({
        host: host.hostname,
        port: host.port,
        username: host.username,
        privateKey: keyPair.privateKey,
      });
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
      hostId: options.hostId,
      command: options.command,
      exitCode,
      stdout: finalStdout,
      stderr: finalStderr,
      truncated,
      durationMs,
    };
  };
}

export { SshService };
export type { CommandCheck };
