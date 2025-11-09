import { ModelProviderCard } from '@/types/llm';

const Agentical: ModelProviderCard = {
  chatModels: [
    {
      description: 'Default Agentical WebRTC model for local development.',
      displayName: 'Agentical LLM',
      enabled: true,
      id: 'agentical-llm',
    },
  ],
  checkModel: 'agentical-llm',
  description:
    'Agentical: maximal private and secure AI agentic LLM API service.',
  id: 'agentical',
  modelList: { showModelFetcher: false },
  name: 'Agentical',
  settings: {
    defaultShowBrowserRequest: true,
    disableBrowserRequest: true,
    proxyUrl: {
      placeholder: 'ws://localhost:3003/webrtc',
      title: 'Signaling URL',
    },
    sdkType: 'openai',
    showApiKey: true,
  },
  url: 'https://agentical.net',
};

export default Agentical;

