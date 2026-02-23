import type { ZodType } from 'zod';

type ConnectionFieldDefinition = {
  schema: ZodType;
  secretFields: string[];
};

type ConnectionTypeDefinition = {
  id: string;
  name: string;
  description: string;
  fields: ConnectionFieldDefinition;
};

type Connection = {
  id: string;
  userId: string;
  type: string;
  name: string;
  fields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type { ConnectionTypeDefinition, ConnectionFieldDefinition, Connection };
