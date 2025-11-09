import { ClientOptions } from 'openai';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

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

type IceServerConfig = {
  credential?: string;
  credentialType?: 'oauth' | 'password';
  urls: string | string[];
  username?: string;
};

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

const DEFAULT_HANDSHAKE_TIMEOUT = 15_000;
const DEFAULT_SIGNALING_URL = 'ws://localhost:3003/webrtc';

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

const decodeMessageData = (data: any, textDecoder: TextDecoder | null) => {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) {
    return textDecoder ? textDecoder.decode(data) : new TextDecoder().decode(data);
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return data.text();
  }

  return String(data);
};

interface SocketEndpointConfig {
  namespace?: string;
  origin: string;
  path?: string;
  query?: Record<string, string>;
}

type SessionDescriptionType = 'answer' | 'offer' | 'pranswer' | 'rollback';

interface BasicSessionDescription {
  sdp: string;
  type: SessionDescriptionType;
}

interface BasicIceCandidateInit {
  candidate: string;
  sdpMLineIndex?: number | null;
  sdpMid?: string | null;
  usernameFragment?: string | null;
}

const normalizeSignalingPayload = (
  payload: unknown,
  textDecoder: TextDecoder | null,
): Record<string, any> | null | Promise<Record<string, any> | null> => {
  if (typeof payload === 'string') {
    const parsed = safeParseJSON(payload);
    return isRecord(parsed) ? parsed : null;
  }

  if (isRecord(payload)) {
    return payload;
  }

  const decoded = decodeMessageData(payload, textDecoder);

  if (decoded instanceof Promise) {
    return decoded.then((value) => (isRecord(value) ? value : null));
  }

  return isRecord(decoded) ? decoded : null;
};

const extractSessionDescription = (
  value: unknown,
  fallbackType: SessionDescriptionType,
): BasicSessionDescription | null => {
  if (typeof value === 'string') {
    return { sdp: value, type: fallbackType };
  }

  if (isRecord(value) && typeof value.sdp === 'string') {
    const type = (typeof value.type === 'string' ? value.type : fallbackType) as SessionDescriptionType;
    return { sdp: value.sdp, type };
  }

  return null;
};

const isIceCandidateInit = (value: unknown): value is BasicIceCandidateInit => {
  if (!isRecord(value)) return false;
  return typeof value.candidate === 'string';
};

const parseSocketEndpoint = (raw: string): SocketEndpointConfig => {
  try {
    const url = new URL(raw);
    const namespace = url.pathname && url.pathname !== '/' ? url.pathname : undefined;
    const protocol =
      url.protocol === 'ws:' ? 'http:' : url.protocol === 'wss:' ? 'https:' : url.protocol;

    let socketPath: string | undefined;
    const queryEntries = Array.from(url.searchParams.entries());
    const query = queryEntries.reduce<Record<string, string>>((acc, [key, value]) => {
      if (key === 'ioPath' || key === 'socketPath') {
        socketPath = value;
        return acc;
      }

      acc[key] = value;
      return acc;
    }, {});

    return {
      namespace,
      origin: `${protocol}//${url.host}`,
      path: socketPath,
      query: Object.keys(query).length ? query : undefined,
    };
  } catch {
    return { namespace: undefined, origin: raw };
  }
};

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

  private readonly iceServers: IceServerConfig[];

  private readonly textDecoder: TextDecoder | null;

  constructor({ apiKey, baseURL }: ClientOptions = {}) {
    this.apiKey = apiKey;
    const normalizedBaseURL = baseURL && typeof baseURL === 'string' ? baseURL.trim() : '';
    this.baseURL = normalizedBaseURL || DEFAULT_SIGNALING_URL;
    this.iceServers = DEFAULT_ICE_SERVERS;
    this.handshakeTimeout = DEFAULT_HANDSHAKE_TIMEOUT;
    this.textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
    if (!normalizedBaseURL) {
      console.info(
        `[Agentical] No signaling URL provided. Falling back to default: ${DEFAULT_SIGNALING_URL}.`,
      );
    }
  }

  async chat(payload: ChatStreamPayload, options?: ChatCompetitionOptions) {
    try {
      this.assertBrowserRuntime();

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
      const {
        namespace: signalingNamespace,
        origin: signalingOrigin,
        path: signalingPath,
        query: signalingQuery,
      } = parseSocketEndpoint(signalingUrl);

      const signalingTarget = signalingNamespace
        ? `${signalingOrigin}${signalingNamespace}`
        : signalingOrigin;

      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      let dataChannel: RTCDataChannel | null = null;
      const signalingOptions: Parameters<typeof io>[1] = {
        autoConnect: false,
        forceNew: true,
        reconnection: false,
        transports: ['websocket'],
      };

      if (signalingPath) {
        signalingOptions.path = signalingPath;
      }

      if (signalingQuery) {
        signalingOptions.query = signalingQuery;
      }

      const signaling: Socket = io(signalingTarget, signalingOptions);

      const pendingRemoteCandidates: BasicIceCandidateInit[] = [];
      const outgoingMessages: Array<{ event: string; payload: any }> = [];

      let resolved = false;
      let closed = false;
      let streamController: ReadableStreamDefaultController<any> | null = null;
      let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
      let abortHandler: (() => void) | undefined;
      let handleDataChannelMessage: ((event: MessageEvent<any>) => void) | null = null;
      let handleDataChannelClose: (() => void) | null = null;
      let handleDataChannelError: ((event: Event) => void) | null = null;
      let handleDataChannelOpen: (() => void) | null = null;
      let handleConnectionStateChange: (() => void) | null = null;
      let handleIceCandidate: ((event: any) => void) | null = null;
      let handleDataChannelEvent: ((event: RTCDataChannelEvent) => void) | null = null;
      let remoteClientId: string | null = null;

      const registerDataChannelListeners = () => {
        if (!dataChannel) return;

        if (handleDataChannelOpen) {
          dataChannel.addEventListener('open', handleDataChannelOpen);
          if (dataChannel.readyState === 'open') {
            handleDataChannelOpen();
          }
        }

        if (handleDataChannelClose) {
          dataChannel.addEventListener('close', handleDataChannelClose);
        }

        if (handleDataChannelMessage) {
          dataChannel.addEventListener('message', handleDataChannelMessage);
        }

        if (handleDataChannelError) {
          dataChannel.addEventListener('error', handleDataChannelError);
        }
      };

      const unregisterDataChannelListeners = () => {
        if (!dataChannel) return;

        if (handleDataChannelOpen) {
          dataChannel.removeEventListener('open', handleDataChannelOpen);
        }

        if (handleDataChannelClose) {
          dataChannel.removeEventListener('close', handleDataChannelClose);
        }

        if (handleDataChannelMessage) {
          dataChannel.removeEventListener('message', handleDataChannelMessage);
        }

        if (handleDataChannelError) {
          dataChannel.removeEventListener('error', handleDataChannelError);
        }
      };

      const attachDataChannel = (channel: RTCDataChannel) => {
        if (dataChannel === channel) return;

        unregisterDataChannelListeners();

        dataChannel = channel;
        registerDataChannelListeners();

        if (dataChannel.readyState === 'open' && handleDataChannelOpen) {
          handleDataChannelOpen();
        }
      };

      const cleanup = (_reason?: any) => {
        if (closed) return;
        closed = true;
        void _reason;

        if (handshakeTimer) {
          globalThis.clearTimeout(handshakeTimer);
          handshakeTimer = undefined;
        }

        if (abortHandler && options?.signal) {
          options.signal.removeEventListener('abort', abortHandler);
        }

        unregisterDataChannelListeners();
        handleDataChannelOpen = null;
        handleDataChannelClose = null;
        handleDataChannelMessage = null;
        handleDataChannelError = null;

        if (handleIceCandidate) {
          pc.removeEventListener('icecandidate', handleIceCandidate);
          handleIceCandidate = null;
        }

        if (handleDataChannelEvent) {
          pc.removeEventListener('datachannel', handleDataChannelEvent);
          handleDataChannelEvent = null;
        }

        if (handleConnectionStateChange) {
          pc.removeEventListener('connectionstatechange', handleConnectionStateChange);
          handleConnectionStateChange = null;
        }

        outgoingMessages.length = 0;

        if (dataChannel) {
          try {
            if (
              dataChannel.readyState === 'open' ||
              dataChannel.readyState === 'connecting'
            ) {
              dataChannel.close();
            }
          } catch {
            /* ignore */
          }

          dataChannel = null;
        }

        remoteClientId = null;

        try {
          pc.close();
        } catch {
          /* ignore */
        }

        try {
          signaling.removeAllListeners();
          signaling.disconnect();
        } catch {
          /* ignore */
        }
      };

      const fail = (error: Error) => {
        if (!resolved) {
          reject(error);
        } else if (streamController) {
          try {
            streamController.error(error);
          } catch {
            /* ignore */
          }
        }

        cleanup(error);
      };

      const emitMessage = (event: string, payload: unknown) => {
        try {
          if (signaling.connected) {
            signaling.emit(event, payload);
          } else {
            // Queue message if not connected yet
            outgoingMessages.push({ event, payload });
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const flushQueuedMessages = () => {
        if (!signaling.connected || outgoingMessages.length === 0) return;

        const buffered = outgoingMessages.splice(0, outgoingMessages.length);
        for (const { event, payload } of buffered) {
          try {
            signaling.emit(event, payload);
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
            break;
          }
        }
      };

      let fulfill: () => void;

      handleDataChannelOpen = () => {
        if (!dataChannel) return;

        if (handleDataChannelOpen) {
          dataChannel.removeEventListener('open', handleDataChannelOpen);
          handleDataChannelOpen = null;
        }

        try {
          const requestMessage: AgenticalChatRequest = {
            apiKey: this.apiKey,
            body: payload,
            headers: options?.requestHeaders,
            provider: ModelProvider.Agentical,
            type: 'chat',
          };

          dataChannel.send(JSON.stringify(requestMessage));
          if (handshakeTimer) {
            globalThis.clearTimeout(handshakeTimer);
            handshakeTimer = undefined;
          }
          fulfill();
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const chunkStream = new ReadableStream<any>({
        cancel: (reason) => {
          cleanup(reason);
        },
        start: (controller) => {
          streamController = controller;

          handleDataChannelMessage = (event) => {
            Promise.resolve(decodeMessageData(event.data, this.textDecoder))
              .then((rawValue) => {
                const raw = typeof rawValue === 'string' ? rawValue : String(rawValue);

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
              })
              .catch((error) =>
                fail(error instanceof Error ? error : new Error(String(error))),
              );
          };

          handleDataChannelClose = () => {
            if (!resolved) {
              fail(new Error('Agentical data channel closed before streaming.'));
              return;
            }

            controller.close();
            cleanup();
          };

          handleDataChannelError = (event) => {
            const channelError: Error =
              typeof (event as { error?: unknown }).error === 'object' &&
              (event as { error?: unknown }).error instanceof Error
                ? ((event as { error?: unknown }).error as Error)
                : new Error('Agentical data channel error');
            fail(channelError);
          };

          registerDataChannelListeners();
        },
      });

      const sseStream = OpenAIStream(chunkStream, {
        callbacks: options?.callback,
        provider: ModelProvider.Agentical,
      });

      fulfill = () => {
        if (resolved) return;
        resolved = true;
        resolve({ stream: sseStream });
      };

      handleIceCandidate = (event: RTCPeerConnectionIceEvent) => {
        if (!event.candidate) return;

        // Send ICE candidate to signaling server
        // Server expects { candidate: RTCIceCandidateInit }
        const candidateInit = event.candidate.toJSON();

        emitMessage('ice-candidate', {
          candidate: candidateInit,
        });
      };

      pc.addEventListener('icecandidate', handleIceCandidate);

      handleDataChannelEvent = (event: RTCDataChannelEvent) => {
        attachDataChannel(event.channel);
      };

      pc.addEventListener('datachannel', handleDataChannelEvent);

      handleConnectionStateChange = () => {
        const state = pc.connectionState;
        if (['failed', 'disconnected'].includes(state)) {
          fail(new Error(`Agentical WebRTC connection ${state}`));
        }
      };

      pc.addEventListener('connectionstatechange', handleConnectionStateChange);

      const flushPendingRemoteCandidates = async () => {
        while (pendingRemoteCandidates.length > 0) {
          const candidate = pendingRemoteCandidates.shift();
          if (!candidate) continue;
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.warn('[Agentical] Failed to add ICE candidate', error);
          }
        }
      };

      handshakeTimer = globalThis.setTimeout(() => {
        fail(new Error('Agentical signaling handshake timed out.'));
      }, this.handshakeTimeout);

      const handleOfferPayload = async (parsed: Record<string, any> | null) => {
        if (!parsed) return;

        // Extract SDP from offer payload - server sends { sdp: RTCSessionDescriptionInit, from: string }
        const sdpData = parsed.sdp || parsed.offer;
        if (!sdpData) return;

        const description = extractSessionDescription(sdpData, 'offer');
        if (!description) return;

        if (pc.signalingState !== 'stable') {
          console.warn('[Agentical] Ignoring offer; connection not in stable state.');
          return;
        }

        remoteClientId = typeof parsed.from === 'string' ? parsed.from : remoteClientId;

        try {
          // 1. Set the received offer as the remote description
          await pc.setRemoteDescription(new RTCSessionDescription(description));

          // Flush any pending ICE candidates that arrived before the offer
          await flushPendingRemoteCandidates();

          // 2. Create an answer to the offer
          const answer = await pc.createAnswer();

          // 3. Set the created answer as the local description
          await pc.setLocalDescription(answer);

          // 4. Send the answer back to the signaling server
          // Server expects { sdp: RTCSessionDescriptionInit }
          const answerSdp = pc.localDescription?.sdp || answer.sdp;
          if (!answerSdp) {
            throw new Error('Agentical answer is missing SDP.');
          }

          emitMessage('answer', {
            sdp: {
              sdp: answerSdp,
              type: 'answer',
            },
          });
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const handleOfferMessage = (payload: unknown) => {
        try {
          const normalized = normalizeSignalingPayload(payload, this.textDecoder);
          if (normalized instanceof Promise) {
            normalized
              .then((parsed) => handleOfferPayload(parsed))
              .catch((error) =>
                fail(error instanceof Error ? error : new Error(String(error))),
              );
            return;
          }

          void handleOfferPayload(normalized);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const handleAnswerPayload = async (parsed: Record<string, any> | null) => {
        if (!parsed) return;

        // Extract SDP from answer payload - server sends { sdp: RTCSessionDescriptionInit, from: string }
        const sdpData = parsed.sdp || parsed.answer;
        if (!sdpData) return;

        const description = extractSessionDescription(sdpData, 'answer');
        if (!description) return;

        if (pc.signalingState !== 'have-local-offer') {
          console.warn('[Agentical] Ignoring answer; connection not in have-local-offer state.');
          return;
        }

        remoteClientId = typeof parsed.from === 'string' ? parsed.from : remoteClientId;

        try {
          // Set the received answer as the remote description
          await pc.setRemoteDescription(new RTCSessionDescription(description));
          await flushPendingRemoteCandidates();
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const handleAnswerMessage = (payload: unknown) => {
        try {
          const normalized = normalizeSignalingPayload(payload, this.textDecoder);
          if (normalized instanceof Promise) {
            normalized
              .then((parsed) => handleAnswerPayload(parsed))
              .catch((error) =>
                fail(error instanceof Error ? error : new Error(String(error))),
              );
            return;
          }

          void handleAnswerPayload(normalized);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const handleRemoteCandidatePayload = (parsed: Record<string, any> | null) => {
        if (!parsed) return;

        // Extract candidate from payload - server sends { candidate: RTCIceCandidateInit, from: string }
        const candidateData = parsed.candidate || parsed.data || parsed;
        const candidate = isIceCandidateInit(candidateData) ? candidateData : undefined;

        if (!candidate) return;

        remoteClientId = typeof parsed.from === 'string' ? parsed.from : remoteClientId;

        // Add the candidate to the peer connection to help establish the connection path
        if (pc.remoteDescription) {
          pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) =>
            console.warn('[Agentical] Failed to add remote candidate', error),
          );
        } else {
          pendingRemoteCandidates.push(candidate);
        }
      };

      const handleRemoteCandidateMessage = (payload: unknown) => {
        try {
          const normalized = normalizeSignalingPayload(payload, this.textDecoder);
          if (normalized instanceof Promise) {
            normalized
              .then((parsed) => handleRemoteCandidatePayload(parsed))
              .catch((error) =>
                fail(error instanceof Error ? error : new Error(String(error))),
              );
            return;
          }

          handleRemoteCandidatePayload(normalized);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const handleSignalingConnect = () => {
        try {
          if (this.apiKey) {
            signaling.emit('auth', { apiKey: this.apiKey });
          }

          flushQueuedMessages();
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const handleSignalingError = (error: unknown) => {
        if (closed) return;
        fail(error instanceof Error ? error : new Error(String(error)));
      };

      const handleSignalingDisconnect = (reason: string) => {
        if (!closed && reason !== 'io client disconnect') {
          fail(new Error(`Agentical signaling closed unexpectedly (${reason})`));
        }
      };

      signaling.on('connect', handleSignalingConnect);
      signaling.on('offer', (data) => handleOfferMessage(data));
      signaling.on('answer', (data) => handleAnswerMessage(data));
      signaling.on('ice-candidate', (data) => handleRemoteCandidateMessage(data));
      signaling.on('connect_error', handleSignalingError);
      signaling.on('error', handleSignalingError);
      signaling.on('disconnect', handleSignalingDisconnect);

      signaling.connect();

      abortHandler = () => {
        fail(new DOMException('Aborted', 'AbortError'));
      };

      options?.signal?.addEventListener('abort', abortHandler, { once: true });
    });
  }
}

export default LobeAgenticalAI;

