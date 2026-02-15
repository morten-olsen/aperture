import { z } from 'zod';

// Configuration types
const calendarSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  auth: z.object({
    username: z.string(),
    password: z.string(),
  }),
  syncIntervalMinutes: z.number().optional(),
  color: z.string().optional(),
});

const expansionWindowSchema = z.object({
  pastMonths: z.number().optional(),
  futureMonths: z.number().optional(),
});

const calendarPluginOptionsSchema = z.object({
  sources: z.array(calendarSourceSchema),
  defaultSyncIntervalMinutes: z.number().optional(),
  injectTodayAgenda: z.boolean().optional(),
  expansionWindow: expansionWindowSchema.optional(),
});

type CalendarSource = z.infer<typeof calendarSourceSchema>;
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
    color: z.string().optional(),
    lastSyncedAt: z.string().optional(),
  })
);

const searchInputSchema = z.object({
  query: z.string().optional(),
  calendarId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().optional(),
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
      })
    ),
  })
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
    })
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
  calendarPluginOptionsSchema,
  calendarSourceSchema,
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

export type {
  CalendarSource,
  CalendarPluginOptions,
  ExpansionWindow,
  Event,
  EventNote,
};
