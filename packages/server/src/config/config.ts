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
  dailyNote: {
    enabled: {
      doc: 'Enable daily note plugin',
      format: Boolean,
      default: true,
      env: 'DAILY_NOTE_ENABLED',
    },
  },
  personality: {
    enabled: {
      doc: 'Enable personality plugin',
      format: Boolean,
      default: true,
      env: 'PERSONALITY_ENABLED',
    },
  },
  todo: {
    enabled: {
      doc: 'Enable todo plugin',
      format: Boolean,
      default: true,
      env: 'TODO_ENABLED',
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
  embeddings: {
    provider: {
      doc: 'Embedding provider (openai or local)',
      format: String,
      default: 'openai' as const,
      env: 'EMBEDDINGS_PROVIDER',
    },
    model: {
      doc: 'Embedding model ID',
      format: String,
      default: 'openai/text-embedding-3-small',
      env: 'EMBEDDINGS_MODEL',
    },
    dimensions: {
      doc: 'Embedding vector dimensions',
      format: 'int',
      default: 1536,
      env: 'EMBEDDINGS_DIMENSIONS',
    },
  },
  location: {
    enabled: {
      doc: 'Enable location plugin',
      format: Boolean,
      default: false,
      env: 'LOCATION_ENABLED',
    },
  },
  weather: {
    enabled: {
      doc: 'Enable weather plugin',
      format: Boolean,
      default: true,
      env: 'WEATHER_ENABLED',
    },
  },
  homeAssistant: {
    enabled: {
      doc: 'Enable Home Assistant plugin',
      format: Boolean,
      default: false,
      env: 'HOME_ASSISTANT_ENABLED',
    },
    url: {
      doc: 'Home Assistant URL',
      format: String,
      default: '',
      env: 'HOME_ASSISTANT_URL',
    },
    token: {
      doc: 'Home Assistant long-lived access token',
      format: String,
      default: '',
      env: 'HOME_ASSISTANT_TOKEN',
      sensitive: true,
    },
    locationTracking: {
      doc: 'Location tracking entries as JSON array of {entity, userId}',
      format: 'json-array' as unknown as 'String',
      default: [] as unknown[],
      env: 'HOME_ASSISTANT_LOCATION_TRACKING',
    },
  },
  blueprint: {
    enabled: {
      doc: 'Enable behavioural blueprints plugin',
      format: Boolean,
      default: true,
      env: 'BLUEPRINT_ENABLED',
    },
    topN: {
      doc: 'Maximum blueprints to surface in context per turn',
      format: 'int',
      default: 5,
      env: 'BLUEPRINT_TOP_N',
    },
    maxDistance: {
      doc: 'Cosine distance threshold for blueprint suggestions (lower = stricter)',
      format: Number,
      default: 0.7,
      env: 'BLUEPRINT_MAX_DISTANCE',
    },
  },
  usage: {
    enabled: {
      doc: 'Enable usage tracking plugin',
      format: Boolean,
      default: true,
      env: 'USAGE_ENABLED',
    },
  },
  webFetch: {
    enabled: {
      doc: 'Enable web fetch plugin',
      format: Boolean,
      default: true,
      env: 'WEB_FETCH_ENABLED',
    },
    maxCharacters: {
      doc: 'Maximum characters returned per fetch',
      format: 'int',
      default: 50000,
      env: 'WEB_FETCH_MAX_CHARACTERS',
    },
    defaultMode: {
      doc: 'Default fetch mode (html, markdown, links)',
      format: String,
      default: 'markdown',
      env: 'WEB_FETCH_DEFAULT_MODE',
    },
    userAgent: {
      doc: 'Custom User-Agent header for web fetches',
      format: String,
      default: 'GLaDOS-Agent/1.0',
      env: 'WEB_FETCH_USER_AGENT',
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
