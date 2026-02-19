import { z } from 'zod';

const blueprintPluginOptionsSchema = z.object({
  topN: z.number().optional().describe('Maximum blueprints to surface in context per turn (default: 5)'),
  maxDistance: z.number().optional().describe('Cosine distance threshold for blueprint suggestions (default: 0.7)'),
});

type BlueprintPluginOptions = z.infer<typeof blueprintPluginOptionsSchema>;

const blueprintSchema = z.object({
  id: z.string(),
  title: z.string(),
  use_case: z.string(),
  process: z.string(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

type Blueprint = z.infer<typeof blueprintSchema>;

const getInputSchema = z.object({
  id: z.string().describe('The blueprint ID to fetch'),
});

const createInputSchema = z.object({
  title: z.string().describe('Short name describing what this blueprint handles'),
  use_case: z.string().describe('When to apply this blueprint — the matching criteria'),
  process: z.string().describe('Step-by-step instructions the agent should follow'),
  notes: z.string().optional().describe('Agent scratch pad — observations, experiments, caveats'),
});

const updateInputSchema = z.object({
  id: z.string().describe('The blueprint ID to update'),
  title: z.string().optional().describe('Updated title'),
  use_case: z.string().optional().describe('Updated use case'),
  process: z.string().optional().describe('Updated process'),
  notes: z.string().optional().describe('Updated notes'),
});

const deleteInputSchema = z.object({
  id: z.string().describe('The blueprint ID to delete'),
});

const deleteOutputSchema = z.object({
  deleted: z.boolean(),
});

const listOutputSchema = z.object({
  blueprints: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      use_case: z.string(),
    }),
  ),
});

export {
  blueprintPluginOptionsSchema,
  blueprintSchema,
  getInputSchema,
  createInputSchema,
  updateInputSchema,
  deleteInputSchema,
  deleteOutputSchema,
  listOutputSchema,
};

export type { BlueprintPluginOptions, Blueprint };
