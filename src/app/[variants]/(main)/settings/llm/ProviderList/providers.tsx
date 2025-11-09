import { useMemo } from 'react';

import {
  Ai21ProviderCard,
  Ai360ProviderCard,
  AgenticalProviderCard,
  AnthropicProviderCard,
  BaichuanProviderCard,
  CohereProviderCard,
  DeepSeekProviderCard,
  FireworksAIProviderCard,
  GiteeAIProviderCard,
  GoogleProviderCard,
  GroqProviderCard,
  HigressProviderCard,
  HunyuanProviderCard,
  InfiniAIProviderCard,
  InternLMProviderCard,
  JinaProviderCard,
  MinimaxProviderCard,
  MistralProviderCard,
  MoonshotProviderCard,
  NovitaProviderCard,
  NvidiaProviderCard,
  OpenRouterProviderCard,
  PPIOProviderCard,
  PerplexityProviderCard,
  QiniuProviderCard,
  QwenProviderCard,
  SambaNovaProviderCard,
  Search1APIProviderCard,
  SenseNovaProviderCard,
  SiliconCloudProviderCard,
  SparkProviderCard,
  StepfunProviderCard,
  TaichuProviderCard,
  TogetherAIProviderCard,
  UpstageProviderCard,
  VLLMProviderCard,
  WenxinProviderCard,
  XAIProviderCard,
  XinferenceProviderCard,
  ZeroOneProviderCard,
  ZhiPuProviderCard,
} from '@/config/modelProviders';

import { ProviderItem } from '../type';
import { useAzureProvider } from './Azure';
import { useBedrockProvider } from './Bedrock';
import { useCloudflareProvider } from './Cloudflare';
import { useGithubProvider } from './Github';
import { useHuggingFaceProvider } from './HuggingFace';
import { useOllamaProvider } from './Ollama';
import { useOpenAIProvider } from './OpenAI';

export const useProviderList = (): ProviderItem[] => {
  const AzureProvider = useAzureProvider();
  const OllamaProvider = useOllamaProvider();
  const OpenAIProvider = useOpenAIProvider();
  const BedrockProvider = useBedrockProvider();
  const CloudflareProvider = useCloudflareProvider();
  const GithubProvider = useGithubProvider();
  const HuggingFaceProvider = useHuggingFaceProvider();

  return useMemo(
    () => {
      const providers = [
        OpenAIProvider,
        AzureProvider,
        AgenticalProviderCard,
        OllamaProvider,
        VLLMProviderCard,
      XinferenceProviderCard,
      AnthropicProviderCard,
      BedrockProvider,
      GoogleProviderCard,
      DeepSeekProviderCard,
      HuggingFaceProvider,
      OpenRouterProviderCard,
      CloudflareProvider,
      GithubProvider,
      NovitaProviderCard,
      TogetherAIProviderCard,
      FireworksAIProviderCard,
      GroqProviderCard,
      NvidiaProviderCard,
      PerplexityProviderCard,
      MistralProviderCard,
      Ai21ProviderCard,
      UpstageProviderCard,
      XAIProviderCard,
      JinaProviderCard,
      SambaNovaProviderCard,
      Search1APIProviderCard,
      CohereProviderCard,
      QiniuProviderCard,
      QwenProviderCard,
      WenxinProviderCard,
      HunyuanProviderCard,
      SparkProviderCard,
      ZhiPuProviderCard,
      ZeroOneProviderCard,
      SenseNovaProviderCard,
      StepfunProviderCard,
      MoonshotProviderCard,
      BaichuanProviderCard,
      MinimaxProviderCard,
      Ai360ProviderCard,
      TaichuProviderCard,
      InternLMProviderCard,
      SiliconCloudProviderCard,
      HigressProviderCard,
      GiteeAIProviderCard,
      PPIOProviderCard,
      InfiniAIProviderCard,
      ];

      // Debug: check for duplicate IDs
      const idMap = new Map<string, number>();
      providers.forEach((provider, index) => {
        if (idMap.has(provider.id)) {
          console.warn(`Duplicate provider ID found: "${provider.id}" at index ${index} and ${idMap.get(provider.id)}`);
        } else {
          idMap.set(provider.id, index);
        }
      });

      // Remove duplicates based on id (keep first occurrence)
      const uniqueProviders = providers.filter((provider, index) => {
        const firstIndex = providers.findIndex(p => p.id === provider.id);
        return firstIndex === index;
      });

      return uniqueProviders;
    },
    [
      AzureProvider,
      OllamaProvider,
      OpenAIProvider,
      BedrockProvider,
      CloudflareProvider,
      GithubProvider,
      HuggingFaceProvider,
    ],
  );
};
