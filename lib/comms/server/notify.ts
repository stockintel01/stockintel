import 'server-only';

import type { NotificationEventType } from '@/lib/comms/events';
import { forTenant } from '@/lib/comms/server/repository';

/**
 * The only entrypoint application code uses to send a notification. It records the
 * event and returns; recipients, consent, quota, and delivery are all resolved later
 * by the worker, so a caller can never be slowed down or failed by messaging.
 *
 * Call it from a route handler inside `after()` so it runs once the response is sent.
 * Returns false when an event with the same idempotency key already exists.
 */
export async function notify(input: {
  organizationId: string;
  eventType: NotificationEventType;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  source?: { type: string; id: string };
}): Promise<boolean> {
  return forTenant(input.organizationId).insertEvent({
    eventType: input.eventType,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
    sourceType: input.source?.type ?? null,
    sourceId: input.source?.id ?? null,
  });
}
