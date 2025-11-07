import { ClientOptions } from 'openai';

import { safeParseJSON } from '@/utils/safeParseJSON';

import { LobeRuntimeAI } from '../BaseAI';
import { AgentRuntimeErrorType } from '../error';
import {
  ChatCompetitionOptions,
  ChatStreamPayload,
  ModelProvider,
} from '../types';
import { AgentRuntimeError } from '../utils/createError';
import { StreamingResponse } from '../utils/response';
import { OpenAIStream } from '../utils/streams/openai';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

const DEFAULT_HANDSHAKE_TIMEOUT = 15_000;

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null;

const buildFallbackChunk = (model: string, content: string) => ({
  choices: [
    {
      delta: { content },
      finish_reason: null,
      index: 0,
    },
  ],
  created: Math.floor(Date.now() / 1000),
  id: `agentical-${Date.now()}`,
  model,
  object: 'chat.completion.chunk',
});

interface AgenticalChatRequest {
  apiKey?: string;
  body: ChatStreamPayload;
  headers?: Record<string, any>;
  provider: string;
  type: 'chat';
}

export class LobeAgenticalAI implements LobeRuntimeAI {
  private readonly apiKey?: string;

  readonly baseURL?: string;

  private readonly handshakeTimeout: number;

  private readonly iceServers: RTCIceServer[];

  private readonly textDecoder: TextDecoder | null;

  constructor({ apiKey, baseURL }: ClientOptions = {}) {
    this.apiKey = apiKey;
    const normalizedBaseURL = baseURL ?? undefined;
    this.baseURL = normalizedBaseURL;
    this.iceServers = DEFAULT_ICE_SERVERS;
    this.handshakeTimeout = DEFAULT_HANDSHAKE_TIMEOUT;
    this.textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

    if (!normalizedBaseURL) {
      console.warn('[Agentical] Initialize runtime without signaling URL (`baseURL`).');
    }
  }

  async chat(payload: ChatStreamPayload, options?: ChatCompetitionOptions) {
    try {
      this.assertBrowserRuntime();

      if (!this.baseURL) {
        throw new Error('Agentical signaling URL (baseURL) is required.');
      }

      const requestPayload: ChatStreamPayload = { ...payload, stream: true };

      const { stream } = await this.createWebRTCChatStream(requestPayload, options);

      return StreamingResponse(stream, {
        headers: options?.headers,
      });
    } catch (error) {
      throw AgentRuntimeError.chat({
        error: this.formatError(error),
        errorType: AgentRuntimeErrorType.ProviderBizError,
        provider: ModelProvider.Agentical,
      });
    }
  }

  async models() {
    return [];
  }

  private assertBrowserRuntime() {
    if (typeof window === 'undefined') {
      throw new Error('Agentical WebRTC runtime is only available in browser environments.');
    }

    if (typeof RTCPeerConnection === 'undefined') {
      throw new Error('RTCPeerConnection is not supported in this environment.');
    }

    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not available in this environment.');
    }
  }

  private formatError(error: unknown) {
    if (error instanceof Error) {
      const { message, name } = error;
      return { message, name };
    }

    return { message: String(error) };
  }

  private async createWebRTCChatStream(
    payload: ChatStreamPayload,
    options?: ChatCompetitionOptions,
  ) {
    return await new Promise<{
      stream: ReadableStream<Uint8Array>;
    }>((resolve, reject) => {
      const signalingUrl = this.baseURL!;

      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      const dataChannel = pc.createDataChannel('agentical', { ordered: true });
      const signaling = new WebSocket(signalingUrl);

      const pendingRemoteCandidates: RTCIceCandidateInit[] = [];

      let resolved = false;
      let closed = false;
      let streamController: ReadableStreamDefaultController<any> | null = null;
      let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
      let abortHandler: (() => void) | undefined;

      const cleanup = (reason?: any) => {
        if (closed) return;
        closed = true;

        if (handshakeTimer) globalThis.clearTimeout(handshakeTimer);

        if (abortHandler && options?.signal) {
          options.signal.removeEventListener('abort', abortHandler);
        }

        dataChannel.onopen = null;
        dataChannel.onclose = null;
        dataChannel.onmessage = null;
        dataChannel.onerror = null;

        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;

        signaling.onopen = null;
        signaling.onmessage = null;
        signaling.onerror = null;
        signaling.onclose = null;

        try {
          if (
            dataChannel.readyState === 'open' ||
            dataChannel.readyState === 'connecting'
          ) {
            dataChannel.close();
          }
        } catch {}

        try {
          pc.close();
        } catch {}

        try {
          if (signaling.readyState === WebSocket.OPEN || signaling.readyState === WebSocket.CONNECTING) {
            signaling.close(1000, typeof reason === 'string' ? reason : undefined);
          }
        } catch {}
      };

      const fail = (error: Error) => {
        if (!resolved) {
          reject(error);
        } else if (streamController) {
          try {
            streamController.error(error);
          } catch {}
        }

        cleanup(error);
      };

      const decode = (data: any) => {
        if (typeof data === 'string') return data;
        if (data instanceof ArrayBuffer) {
          return this.textDecoder ? this.textDecoder.decode(data) : new TextDecoder().decode(data);
        }

        if (typeof Blob !== 'undefined' && data instanceof Blob) {
          return data.text();
        }

        return String(data);
      };

      const chunkStream = new ReadableStream<any>({
        cancel: (reason) => {
          cleanup(reason);
        },
        start: (controller) => {
          streamController = controller;

          dataChannel.onmessage = (event) => {
            const process = (raw: string) => {
              if (raw === '[DONE]') {
                controller.close();
                cleanup();
                return;
              }

              const parsed = safeParseJSON(raw);

              if (isRecord(parsed)) {
                if (parsed.type === 'error') {
                  const error = new Error(parsed.message || 'Agentical runtime error');
                  fail(error);
                  return;
                }

                const chunk = parsed.type === 'chunk' && parsed.data ? parsed.data : parsed;
                controller.enqueue(chunk);
                return;
              }

              controller.enqueue(buildFallbackChunk(payload.model, raw));
            };

            const decoded = decode(event.data);

            if (decoded instanceof Promise) {
              decoded.then(process).catch((error) => fail(error instanceof Error ? error : new Error(String(error))));
            } else {
              process(decoded);
            }
          };

          dataChannel.onclose = () => {
            if (!resolved) {
              fail(new Error('Agentical data channel closed before streaming.'));
              return;
            }

            controller.close();
            cleanup();
          };

          dataChannel.onerror = (event) => {
            const error = event instanceof RTCErrorEvent && event.error
              ? event.error
              : new Error('Agentical data channel error');
            fail(error);
          };
        },
      });

      const sseStream = OpenAIStream(chunkStream, {
        callbacks: options?.callback,
        provider: ModelProvider.Agentical,
      });

      const fulfill = () => {
        if (resolved) return;
        resolved = true;
        resolve({ stream: sseStream });
      };

      dataChannel.onopen = () => {
        try {
          const requestMessage: AgenticalChatRequest = {
            apiKey: this.apiKey,
            body: payload,
            headers: options?.requestHeaders,
            provider: ModelProvider.Agentical,
            type: 'chat',
          };

          dataChannel.send(JSON.stringify(requestMessage));
          fulfill();
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && signaling.readyState === WebSocket.OPEN) {
          signaling.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (['failed', 'disconnected'].includes(state)) {
          fail(new Error(`Agentical WebRTC connection ${state}`));
        }
      };

      const applyRemoteDescription = async (sdp: string) => {
        await pc.setRemoteDescription({ sdp, type: 'answer' });

        while (pendingRemoteCandidates.length > 0) {
          const candidate = pendingRemoteCandidates.shift();
          if (!candidate) continue;
          try {
            await pc.addIceCandidate(candidate);
          } catch (error) {
            console.warn('[Agentical] Failed to add ICE candidate', error);
          }
        }
      };

      handshakeTimer = globalThis.setTimeout(() => {
        fail(new Error('Agentical signaling handshake timed out.'));
      }, this.handshakeTimeout);

      signaling.onopen = async () => {
        try {
          if (this.apiKey) {
            signaling.send(JSON.stringify({ apiKey: this.apiKey, type: 'auth' }));
          }

          const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
          await pc.setLocalDescription(offer);

          signaling.send(
            JSON.stringify({ apiKey: this.apiKey, sdp: offer.sdp, type: 'offer' }),
          );
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      signaling.onmessage = (event) => {
        const process = (raw: string) => {
          const parsed = safeParseJSON(raw);
          if (!isRecord(parsed)) return;

          const type = parsed.type || parsed.event;

          switch (type) {
            case 'answer':
            case 'webRTC-answer': {
              const sdp = parsed.sdp || parsed.answer?.sdp;
              if (!sdp) return;
              applyRemoteDescription(sdp).catch((error) => fail(error instanceof Error ? error : new Error(String(error))));
              break;
            }

            case 'candidate': {
              const candidate = parsed.candidate || parsed.data;
              if (!candidate) return;

              if (pc.remoteDescription) {
                pc.addIceCandidate(candidate).catch((error) =>
                  console.warn('[Agentical] Failed to add remote candidate', error),
                );
              } else {
                pendingRemoteCandidates.push(candidate);
              }
              break;
            }

            case 'ready':
            case 'pong':
              break;

            case 'error': {
              const error = new Error(parsed.message || parsed.error || 'Agentical signaling error');
              fail(error);
              break;
            }

            default: {
              if (parsed.answer?.sdp) {
                applyRemoteDescription(parsed.answer.sdp).catch((error) =>
                  fail(error instanceof Error ? error : new Error(String(error))),
                );
              } else if (parsed.candidate) {
                if (pc.remoteDescription) {
                  pc.addIceCandidate(parsed.candidate).catch((error) =>
                    console.warn('[Agentical] Failed to add remote candidate', error),
                  );
                } else {
                  pendingRemoteCandidates.push(parsed.candidate);
                }
              }
              break;
            }
          }
        };

        const decoded = decode(event.data);

        if (decoded instanceof Promise) {
          decoded.then(process).catch((error) => fail(error instanceof Error ? error : new Error(String(error))));
        } else {
          process(decoded);
        }
      };

      signaling.onerror = () => {
        fail(new Error('Agentical signaling connection error.'));
      };

      signaling.onclose = (event) => {
        if (!closed && event.code !== 1000) {
          fail(new Error(`Agentical signaling closed unexpectedly (${event.code})`));
        }
      };

      abortHandler = () => {
        fail(new DOMException('Aborted', 'AbortError'));
      };

      options?.signal?.addEventListener('abort', abortHandler, { once: true });
    });
  }
}

export default LobeAgenticalAI;

