import { ModelProviderCard } from '@/types/llm';

const Agentical: ModelProviderCard = {
  chatModels: [],
  description:
    'Agentical 通过 WebRTC 连接提供 OpenAI 兼容的对话服务，适合需要低延迟、端到端传输的实时场景。',
  id: 'agentical',
  modelList: { showModelFetcher: false },
  name: 'Agentical',
  settings: {
    defaultShowBrowserRequest: true,
    disableBrowserRequest: true,
    sdkType: 'openai',
    showApiKey: true,
    proxyUrl: {
      placeholder: 'wss://your-agentical-signaling-url',
      title: 'Signaling URL',
    },
  },
  url: 'https://agentical.ai',
};

export default Agentical;

