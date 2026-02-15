#!/usr/bin/env node

import { loadConfig } from '../config/config.js';

import { startServer } from './server.js';

const main = async () => {
  const config = loadConfig();
  await startServer({ config: config.getProperties() });
};

main().catch((error) => {
  console.error('[glados] Fatal error:', error);
  process.exit(1);
});
