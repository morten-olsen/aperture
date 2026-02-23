import { z } from 'zod';

// CalDAV connection fields for registering with ConnectionService
const caldavConnectionFieldsSchema = z.object({
  url: z.string().describe('CalDAV server URL'),
  username: z.string().describe('CalDAV username'),
  passwordSecretId: z.string().describe('Secret ID for the CalDAV password'),
});

type CaldavConnectionFields = z.infer<typeof caldavConnectionFieldsSchema>;

// Configuration types
const expansionWindowSchema = z.object({
  pastMonths: z.number().optional(),
  futureMonths: z.number().optional(),
});

const calendarPluginOptionsSchema = z.object({
  defaultSyncIntervalMinutes: z.number().optional(),
  injectTodayAgenda: z.boolean().optional(),
  expansionWindow: expansionWindowSchema.optional(),
});

type ExpansionWindow = z.infer<typeof expansionWindowSchema>;
type CalendarPluginOptions = z.infer<typeof calendarPluginOptionsSchema>;

// Event types
const eventNoteSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

const eventSchema = z.object({
  uid: z.string(),
  calendarId: z.string(),
  summary: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean(),
  isRecurring: z.boolean(),
  notes: z.array(eventNoteSchema),
});

type EventNote = z.infer<typeof eventNoteSchema>;
type Event = z.infer<typeof eventSchema>;

// Tool input/output schemas
const listOutputSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    lastSyncedAt: z.string().optional(),
  }),
);

const searchInputSchema = z.object({
  query: z.string().optional().describe('Text to search in event summary, description, or location'),
  calendarId: z.string().optional().describe('Filter by calendar connection ID'),
  from: z
    .string()
    .optional()
    .describe('Start of date range, ISO 8601 date (YYYY-MM-DD) or datetime (YYYY-MM-DDTHH:mm:ssZ)'),
  to: z
    .string()
    .optional()
    .describe('End of date range, ISO 8601 date (YYYY-MM-DD) or datetime (YYYY-MM-DDTHH:mm:ssZ)'),
  limit: z.number().optional().describe('Max number of events to return (default 20)'),
});

const searchOutputSchema = z.array(
  z.object({
    uid: z.string(),
    calendarId: z.string(),
    summary: z.string(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    startAt: z.string(),
    endAt: z.string(),
    allDay: z.boolean(),
    isRecurring: z.boolean(),
    notes: z.array(
      z.object({
        id: z.string(),
        content: z.string(),
        createdAt: z.string(),
      }),
    ),
  }),
);

const getInputSchema = z.object({
  uid: z.string(),
});

const getOutputSchema = z.object({
  uid: z.string(),
  calendarId: z.string(),
  summary: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean(),
  isRecurring: z.boolean(),
  notes: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

const addNoteInputSchema = z.object({
  eventUid: z.string(),
  content: z.string(),
});

const addNoteOutputSchema = z.object({
  id: z.string(),
  eventUid: z.string(),
  content: z.string(),
  createdAt: z.string(),
});

const updateNoteInputSchema = z.object({
  noteId: z.string(),
  content: z.string(),
});

const updateNoteOutputSchema = z.object({
  id: z.string(),
  eventUid: z.string(),
  content: z.string(),
  updatedAt: z.string(),
});

const deleteNoteInputSchema = z.object({
  noteId: z.string(),
});

const deleteNoteOutputSchema = z.object({
  success: z.boolean(),
});

export {
  caldavConnectionFieldsSchema,
  calendarPluginOptionsSchema,
  eventNoteSchema,
  eventSchema,
  expansionWindowSchema,
  listOutputSchema,
  searchInputSchema,
  searchOutputSchema,
  getInputSchema,
  getOutputSchema,
  addNoteInputSchema,
  addNoteOutputSchema,
  updateNoteInputSchema,
  updateNoteOutputSchema,
  deleteNoteInputSchema,
  deleteNoteOutputSchema,
};

export type { CaldavConnectionFields, CalendarPluginOptions, ExpansionWindow, Event, EventNote };
