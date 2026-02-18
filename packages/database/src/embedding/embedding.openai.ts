import OpenAI from 'openai';
import type { Services } from '@morten-olsen/agentic-core';

import { EmbeddingConfig } from './embedding.config.js';

type OpenAIEmbeddingProvider = {
  embed: (texts: string[]) => Promise<number[][]>;
};

const createOpenAIEmbeddingProvider = (services: Services): OpenAIEmbeddingProvider => {
  const config = services.get(EmbeddingConfig);
  const client = new OpenAI({
    apiKey: services.config.provider.apiKey,
    baseURL: services.config.provider.baseUrl,
  });

  const embed = async (texts: string[]): Promise<number[][]> => {
    const response = await client.embeddings.create({
      model: config.model,
      input: texts,
      dimensions: config.dimensions,
    });
    return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  };

  return { embed };
};

export { createOpenAIEmbeddingProvider };
export type { OpenAIEmbeddingProvider };
