import crypto from 'node:crypto';

import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { database } from '../database/database.js';
import type { CreateTaskInput, ListTasksInput, TagInput, TodoTask, UpdateTaskInput } from '../schemas/schemas.js';

type OverdueSummary = {
  overdueCount: number;
  urgentPendingCount: number;
  urgentTitles: string[];
};

class TodoService {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    return databaseService.get(database);
  };

  #getTagsForTask = async (taskId: string): Promise<string[]> => {
    const db = await this.#getDb();
    const rows = await db.selectFrom('todo_tags').select('tag').where('task_id', '=', taskId).execute();
    return rows.map((r) => r.tag);
  };

  #rowToTask = async (row: {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    parent_id: string | null;
    position: number;
    project: string | null;
    agent_notes: string | null;
    starts_at: string | null;
    due_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
  }): Promise<TodoTask> => {
    const tags = await this.#getTagsForTask(row.id);
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as TodoTask['status'],
      priority: row.priority as TodoTask['priority'],
      parentId: row.parent_id ?? undefined,
      position: row.position,
      project: row.project ?? undefined,
      agentNotes: row.agent_notes ?? undefined,
      startsAt: row.starts_at ?? undefined,
      dueAt: row.due_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags,
    };
  };

  public create = async (userId: string, input: CreateTaskInput): Promise<TodoTask> => {
    const db = await this.#getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .insertInto('todo_tasks')
      .values({
        id,
        user_id: userId,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? 'pending',
        priority: input.priority ?? 'medium',
        parent_id: input.parentId ?? null,
        position: input.position ?? 0,
        project: input.project ?? null,
        agent_notes: input.agentNotes ?? null,
        starts_at: input.startsAt ?? null,
        due_at: input.dueAt ?? null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    if (input.tags && input.tags.length > 0) {
      await db
        .insertInto('todo_tags')
        .values(
          input.tags.map((tag) => ({
            id: crypto.randomUUID(),
            task_id: id,
            tag,
          })),
        )
        .execute();
    }

    return this.get(userId, id) as Promise<TodoTask>;
  };

  public get = async (userId: string, id: string): Promise<TodoTask | undefined> => {
    const db = await this.#getDb();
    const row = await db
      .selectFrom('todo_tasks')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return this.#rowToTask(row);
  };

  public list = async (userId: string, input: ListTasksInput): Promise<TodoTask[]> => {
    const db = await this.#getDb();
    let query = db.selectFrom('todo_tasks').selectAll().where('user_id', '=', userId);

    if (input.status !== undefined) {
      query = query.where('status', '=', input.status);
    }

    if (input.priority !== undefined) {
      query = query.where('priority', '=', input.priority);
    }

    if (input.project !== undefined) {
      query = query.where('project', '=', input.project);
    }

    if (input.parentId === null) {
      query = query.where('parent_id', 'is', null);
    } else if (input.parentId !== undefined) {
      query = query.where('parent_id', '=', input.parentId);
    }

    if (input.search !== undefined) {
      query = query.where((eb) =>
        eb.or([eb('title', 'like', `%${input.search}%`), eb('description', 'like', `%${input.search}%`)]),
      );
    }

    query = query.orderBy('position', 'asc').orderBy('created_at', 'asc');

    const limit = input.limit ?? 50;
    query = query.limit(limit);

    const rows = await query.execute();
    const tasks = await Promise.all(rows.map((row) => this.#rowToTask(row)));

    if (input.tags && input.tags.length > 0) {
      const requiredTags = input.tags;
      return tasks.filter((task) => requiredTags.every((tag) => task.tags.includes(tag)));
    }

    return tasks;
  };

  public update = async (userId: string, input: UpdateTaskInput): Promise<TodoTask | undefined> => {
    const db = await this.#getDb();
    const existing = await db
      .selectFrom('todo_tasks')
      .selectAll()
      .where('id', '=', input.taskId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!existing) {
      return undefined;
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };

    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.parentId !== undefined) updates.parent_id = input.parentId;
    if (input.position !== undefined) updates.position = input.position;
    if (input.project !== undefined) updates.project = input.project;
    if (input.agentNotes !== undefined) updates.agent_notes = input.agentNotes;
    if (input.startsAt !== undefined) updates.starts_at = input.startsAt;
    if (input.dueAt !== undefined) updates.due_at = input.dueAt;

    if (input.status !== undefined) {
      updates.status = input.status;
      if (input.status === 'completed' && existing.status !== 'completed') {
        updates.completed_at = now;
      } else if (input.status !== 'completed') {
        updates.completed_at = null;
      }
    }

    await db.updateTable('todo_tasks').set(updates).where('id', '=', input.taskId).execute();

    return this.get(userId, input.taskId);
  };

  public remove = async (userId: string, id: string): Promise<void> => {
    const db = await this.#getDb();

    const children = await db
      .selectFrom('todo_tasks')
      .select('id')
      .where('parent_id', '=', id)
      .where('user_id', '=', userId)
      .execute();

    for (const child of children) {
      await this.remove(userId, child.id);
    }

    await db.deleteFrom('todo_tags').where('task_id', '=', id).execute();
    await db.deleteFrom('todo_tasks').where('id', '=', id).where('user_id', '=', userId).execute();
  };

  public addTag = async (userId: string, input: TagInput): Promise<string[]> => {
    const db = await this.#getDb();

    const task = await this.get(userId, input.taskId);
    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }

    const existing = await db
      .selectFrom('todo_tags')
      .select('id')
      .where('task_id', '=', input.taskId)
      .where('tag', '=', input.tag)
      .executeTakeFirst();

    if (!existing) {
      await db
        .insertInto('todo_tags')
        .values({
          id: crypto.randomUUID(),
          task_id: input.taskId,
          tag: input.tag,
        })
        .execute();
    }

    return this.#getTagsForTask(input.taskId);
  };

  public removeTag = async (userId: string, input: TagInput): Promise<string[]> => {
    const db = await this.#getDb();

    const task = await this.get(userId, input.taskId);
    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }

    await db.deleteFrom('todo_tags').where('task_id', '=', input.taskId).where('tag', '=', input.tag).execute();

    return this.#getTagsForTask(input.taskId);
  };

  public getOverdueSummary = async (userId: string): Promise<OverdueSummary> => {
    const db = await this.#getDb();
    const now = new Date().toISOString();

    const overdueRows = await db
      .selectFrom('todo_tasks')
      .select('id')
      .where('user_id', '=', userId)
      .where('status', 'in', ['pending', 'in_progress'])
      .where('due_at', 'is not', null)
      .where('due_at', '<', now)
      .execute();

    const urgentRows = await db
      .selectFrom('todo_tasks')
      .select('title')
      .where('user_id', '=', userId)
      .where('status', 'in', ['pending', 'in_progress'])
      .where('priority', '=', 'urgent')
      .execute();

    return {
      overdueCount: overdueRows.length,
      urgentPendingCount: urgentRows.length,
      urgentTitles: urgentRows.map((r) => r.title),
    };
  };
}

export { TodoService };
export type { OverdueSummary };
