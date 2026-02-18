import type { Services } from '@morten-olsen/agentic-core';

import { EmbeddingConfig } from './embedding.config.js';

type Extractor = (
  texts: string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

type LocalEmbeddingProvider = {
  embed: (texts: string[]) => Promise<number[][]>;
};

const createLocalEmbeddingProvider = (services: Services): LocalEmbeddingProvider => {
  const config = services.get(EmbeddingConfig);
  let pipelinePromise: Promise<Extractor>;

  const getPipeline = () => {
    if (!pipelinePromise) {
      pipelinePromise = (async () => {
        const { pipeline } = await import('@huggingface/transformers');
        return (await pipeline('feature-extraction', config.model)) as unknown as Extractor;
      })();
    }
    return pipelinePromise;
  };

  const embed = async (texts: string[]): Promise<number[][]> => {
    const extractor = await getPipeline();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist();
  };

  return { embed };
};

export { createLocalEmbeddingProvider };
export type { LocalEmbeddingProvider };
