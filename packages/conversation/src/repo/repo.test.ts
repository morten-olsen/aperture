import { describe, it, expect, beforeEach } from 'vitest';
import { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { conversationDatabase } from '../database/database.js';

import { ConversationRepo } from './repo.js';

describe('ConversationRepo', () => {
  let services: Services;
  let repo: ConversationRepo;

  beforeEach(async () => {
    services = Services.mock();
    const dbService = services.get(DatabaseService);
    await dbService.get(conversationDatabase);
    repo = services.get(ConversationRepo);
  });

  describe('user management', () => {
    it('creates a user with ensureUser', async () => {
      await repo.ensureUser('user-1');
      const user = await repo.getUser('user-1');
      expect(user).toBeDefined();
      expect(user?.id).toBe('user-1');
      expect(user?.active_conversation_id).toBeNull();
    });

    it('does not duplicate on repeated ensureUser', async () => {
      await repo.ensureUser('user-1');
      await repo.ensureUser('user-1');
      const user = await repo.getUser('user-1');
      expect(user).toBeDefined();
    });

    it('returns undefined for non-existent user', async () => {
      const user = await repo.getUser('nope');
      expect(user).toBeUndefined();
    });

    it('sets active conversation', async () => {
      await repo.ensureUser('user-1');
      await repo.setActiveConversation('user-1', 'conv-1');
      const user = await repo.getUser('user-1');
      expect(user?.active_conversation_id).toBe('conv-1');
    });

    it('clears active conversation', async () => {
      await repo.ensureUser('user-1');
      await repo.setActiveConversation('user-1', 'conv-1');
      await repo.setActiveConversation('user-1', null);
      const user = await repo.getUser('user-1');
      expect(user?.active_conversation_id).toBeNull();
    });
  });

  describe('conversation CRUD', () => {
    it('creates a conversation with upsert', async () => {
      await repo.ensureUser('user-1');
      await repo.upsert('conv-1', 'user-1', { foo: 'bar' });
      const row = await repo.get('conv-1');
      expect(row).toBeDefined();
      expect(row?.user_id).toBe('user-1');
      expect(row?.state).toBeDefined();
      expect(JSON.parse(row?.state ?? '{}')).toEqual({ foo: 'bar' });
    });

    it('updates an existing conversation with upsert', async () => {
      await repo.ensureUser('user-1');
      await repo.upsert('conv-1', 'user-1', { v: 1 });
      await repo.upsert('conv-1', 'user-1', { v: 2 });
      const row = await repo.get('conv-1');
      expect(JSON.parse(row?.state ?? '{}')).toEqual({ v: 2 });
    });

    it('preserves state when upserting without state', async () => {
      await repo.ensureUser('user-1');
      await repo.upsert('conv-1', 'user-1', { original: true });
      await repo.upsert('conv-1', 'user-1');
      const row = await repo.get('conv-1');
      expect(JSON.parse(row?.state ?? '{}')).toEqual({ original: true });
    });

    it('returns undefined for non-existent conversation', async () => {
      const row = await repo.get('nope');
      expect(row).toBeUndefined();
    });

    it('lists conversations for a user', async () => {
      await repo.ensureUser('user-1');
      await repo.upsert('conv-1', 'user-1');
      await repo.upsert('conv-2', 'user-1');
      const list = await repo.list('user-1');
      expect(list).toHaveLength(2);
    });

    it('updates state', async () => {
      await repo.ensureUser('user-1');
      await repo.upsert('conv-1', 'user-1');
      await repo.updateState('conv-1', { updated: true });
      const row = await repo.get('conv-1');
      expect(JSON.parse(row?.state ?? '{}')).toEqual({ updated: true });
    });
  });

  describe('prompt mappings', () => {
    it('adds and retrieves prompt IDs in insertion order', async () => {
      await repo.ensureUser('user-1');
      await repo.upsert('conv-1', 'user-1');
      await repo.addPrompt('conv-1', 'p-1');
      await repo.addPrompt('conv-1', 'p-2');
      await repo.addPrompt('conv-1', 'p-3');
      const ids = await repo.getPromptIds('conv-1');
      expect(ids).toEqual(['p-1', 'p-2', 'p-3']);
    });

    it('returns empty array for conversation with no prompts', async () => {
      await repo.ensureUser('user-1');
      await repo.upsert('conv-1', 'user-1');
      const ids = await repo.getPromptIds('conv-1');
      expect(ids).toEqual([]);
    });
  });
});
