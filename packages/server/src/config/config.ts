import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import convict from 'convict';

convict.addFormat({
  name: 'json-array',
  validate: (val: unknown) => {
    if (!Array.isArray(val)) {
      throw new TypeError('must be an array');
    }
  },
  coerce: (val: string) => JSON.parse(val) as unknown,
});

convict.addFormat({
  name: 'comma-separated-strings',
  validate: (val: unknown) => {
    if (!Array.isArray(val)) {
      throw new TypeError('must be an array');
    }
  },
  coerce: (val: string) =>
    val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
});

const configSchema = convict({
  database: {
    location: {
      doc: 'Location of database file',
      format: String,
      default: './db.sqlite',
      env: 'DATABASE_LOCATION',
    },
  },
  openai: {
    apiKey: {
      doc: 'OpenAI-compatible API key',
      format: String,
      default: '',
      env: 'OPENAI_API_KEY',
      sensitive: true,
    },
    baseUrl: {
      doc: 'OpenAI-compatible base URL',
      format: String,
      default: '',
      env: 'OPENAI_BASE_URL',
    },
  },
  model: {
    normal: {
      doc: 'Default model ID for normal-tier prompts',
      format: String,
      default: 'google/gemini-3-flash-preview',
      env: 'MODEL_NORMAL',
    },
    high: {
      doc: 'Model ID for high-tier prompts (falls back to normal)',
      format: String,
      default: '',
      env: 'MODEL_HIGH',
    },
  },
  telegram: {
    enabled: {
      doc: 'Enable Telegram plugin',
      format: Boolean,
      default: false,
      env: 'TELEGRAM_ENABLED',
    },
    token: {
      doc: 'Telegram bot token',
      format: String,
      default: '',
      env: 'TELEGRAM_TOKEN',
      sensitive: true,
    },
    users: {
      format: 'json-array' as unknown as 'String',
      default: [] as string[],
      env: 'TELEGRAM_USERS',
    },
  },
  calendar: {
    enabled: {
      doc: 'Enable calendar plugin',
      format: Boolean,
      default: false,
      env: 'CALENDAR_ENABLED',
    },
    sources: {
      doc: 'Calendar sources as JSON array',
      format: 'json-array' as unknown as 'String',
      default: [] as unknown[],
      env: 'CALENDAR_SOURCES',
    },
    defaultSyncIntervalMinutes: {
      doc: 'Default sync interval in minutes',
      format: 'int',
      default: 30,
      env: 'CALENDAR_SYNC_INTERVAL',
    },
    injectTodayAgenda: {
      doc: 'Inject today agenda into context',
      format: Boolean,
      default: true,
      env: 'CALENDAR_INJECT_TODAY_AGENDA',
    },
    expansionWindow: {
      pastMonths: {
        doc: 'RRULE expansion window past months',
        format: 'int',
        default: 1,
        env: 'CALENDAR_EXPANSION_PAST_MONTHS',
      },
      futureMonths: {
        doc: 'RRULE expansion window future months',
        format: 'int',
        default: 3,
        env: 'CALENDAR_EXPANSION_FUTURE_MONTHS',
      },
    },
  },
  trigger: {
    enabled: {
      doc: 'Enable trigger/scheduler plugin',
      format: Boolean,
      default: true,
      env: 'TRIGGER_ENABLED',
    },
  },
});

type ServerConfig = ReturnType<typeof configSchema.getProperties>;

const configPaths = [
  '/etc/glados/config.json',
  resolve(homedir(), '.config/glados/config.json'),
  resolve('config.json'),
];

const loadConfig = () => {
  const existing = configPaths.filter((p) => existsSync(p));
  if (existing.length > 0) {
    configSchema.loadFile(existing);
  }
  configSchema.validate({ allowed: 'warn' });
  return configSchema;
};

export { configSchema, loadConfig };
export type { ServerConfig };
