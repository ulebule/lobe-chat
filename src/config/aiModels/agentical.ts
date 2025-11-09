import { AIChatModelCard } from '@/types/aiModel';

const agenticalChatModels: AIChatModelCard[] = [
  {
    description: 'Default Agentical WebRTC model for local development.',
    displayName: 'Agentical LLM',
    enabled: true,
    id: 'agentical-llm',
    type: 'chat',
  },
];

export const allModels = [...agenticalChatModels];

export default allModels;


