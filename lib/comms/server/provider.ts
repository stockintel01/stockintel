import 'server-only';

import {
  buildTemplateMessage,
  buildTextMessage,
  classifyMetaFailure,
  extractSentMessageId,
  parseMetaError,
  type FailureKind,
} from '@/lib/comms/meta';

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; kind: FailureKind; code: string | null; message: string };

export interface WhatsAppProvider {
  sendTemplate(input: { to: string; templateName: string; languageCode: string; bodyParameters: string[] }): Promise<SendResult>;
  sendText(input: { to: string; body: string }): Promise<SendResult>;
}

const REQUEST_TIMEOUT_MS = 10_000;

export function createMetaCloudProvider(options: {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
  graphBaseUrl?: string;
}): WhatsAppProvider {
  const baseUrl = options.graphBaseUrl?.replace(/\/+$/, '') || 'https://graph.facebook.com';
  const endpoint = `${baseUrl}/${encodeURIComponent(options.graphApiVersion)}/${encodeURIComponent(options.phoneNumberId)}/messages`;

  async function post(payload: Record<string, unknown>): Promise<SendResult> {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network request failed';
      return { ok: false, kind: 'transient', code: null, message: message.slice(0, 500) };
    }

    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const providerMessageId = extractSentMessageId(body);
      if (providerMessageId) return { ok: true, providerMessageId };
      return { ok: false, kind: 'transient', code: null, message: 'WhatsApp accepted the request without returning a message id' };
    }

    const error = parseMetaError(body);
    return { ok: false, kind: classifyMetaFailure(response.status, error.code), code: error.code, message: error.title };
  }

  return {
    sendTemplate: input => post(buildTemplateMessage(input)),
    sendText: input => post(buildTextMessage(input)),
  };
}
