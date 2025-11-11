import { genUserLLMConfig } from './genUserLLMConfig';

export const DEFAULT_LLM_CONFIG = genUserLLMConfig({
  lmstudio: {
    fetchOnClient: true,
  },
  ollama: {
    enabled: true,
    fetchOnClient: true,
  },
  openai: {
    enabled: true,
  },
});

export const DEFAULT_MODEL = 'agentical-llm';

export const DEFAULT_EMBEDDING_MODEL = 'auto_select';
export const DEFAULT_EMBEDDING_PROVIDER = 'agentical';

export const DEFAULT_RERANK_MODEL = 'rerank-english-v3.0';
export const DEFAULT_RERANK_PROVIDER = 'cohere';
export const DEFAULT_RERANK_QUERY_MODE = 'full_text';

export const DEFAULT_PROVIDER = 'agentical';
