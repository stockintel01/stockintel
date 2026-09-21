'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, MessageCircle, PauseCircle } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { authenticatedFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface WhatsAppStatus {
  available: boolean;
  message?: string | null;
  businessNumber?: string;
  connection?: {
    maskedNumber: string;
    status: 'active' | 'paused' | 'unreachable';
    connectedAt: string;
  } | null;
}

interface PendingCode {
  code: string;
  expiresAt: string;
  businessNumber: string;
  whatsappUrl: string;
  previousConnectedAt: string | null;
}

const ENDPOINT = '/api/comms/contacts/me';
const POLL_INTERVAL_MS = 4000;

async function readBody(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({}));
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Lets a team member connect their own WhatsApp number for low-stock alerts. Hidden when alerts aren't available. */
export function WhatsAppAlertsCard() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [pending, setPending] = useState<PendingCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    const response = await authenticatedFetch(ENDPOINT, {}, { forceRefresh: false });
    const body = await readBody(response);
    if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'WhatsApp settings could not be loaded.');
    const next = body as unknown as WhatsAppStatus;
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    loadStatus().catch(() => setStatus({ available: false }));
  }, [loadStatus]);

  // While a code is outstanding, check for the member's WhatsApp message until it arrives or the code expires.
  useEffect(() => {
    if (!pending) return;
    const check = () => {
      if (Date.now() > new Date(pending.expiresAt).getTime()) {
        setPending(null);
        setError('That code expired. Connect again to get a new one.');
        return;
      }
      loadStatus()
        .then(next => {
          const connection = next.connection;
          if (connection?.status === 'active' && connection.connectedAt !== pending.previousConnectedAt) setPending(null);
        })
        .catch(() => undefined);
    };
    // People send the code from the WhatsApp app, so check straight away when they come back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const timer = window.setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pending, loadStatus]);

  async function requestCode() {
    setBusy(true);
    setError('');
    try {
      const response = await authenticatedFetch(ENDPOINT, { method: 'POST' });
      const body = await readBody(response);
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'A connection code could not be created.');
      setConfirmingDisconnect(false);
      setPending({ ...(body as unknown as Omit<PendingCode, 'previousConnectedAt'>), previousConnectedAt: status?.connection?.connectedAt ?? null });
    } catch (requestError) {
      setError(errorText(requestError, 'A connection code could not be created.'));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      const response = await authenticatedFetch(ENDPOINT, { method: 'DELETE' });
      const body = await readBody(response);
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'WhatsApp could not be disconnected.');
      setConfirmingDisconnect(false);
      await loadStatus();
    } catch (disconnectError) {
      setError(errorText(disconnectError, 'WhatsApp could not be disconnected.'));
    } finally {
      setBusy(false);
    }
  }

  const connection = status?.connection ?? null;
  if (!status || (!status.available && !connection)) return null;

  const disconnectControls = confirmingDisconnect ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Stop WhatsApp alerts on this number?</span>
      <Button size="sm" variant="destructive" disabled={busy} onClick={() => void disconnect()}>
        {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Disconnect
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmingDisconnect(false)}>Keep</Button>
    </div>
  ) : (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmingDisconnect(true)}>Disconnect</Button>
  );

  const connectButton = (label: string) => (
    <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={busy || !status.available} onClick={() => void requestCode()}>
      {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-1 h-4 w-4" />}
      {label}
    </Button>
  );

  let icon = <MessageCircle className="h-5 w-5 text-green-600" aria-hidden="true" />;
  let title = 'Get low-stock alerts on WhatsApp';
  let description = "We'll message you when an item reaches its minimum stock, so you can reorder before it runs out.";
  let actions = connectButton('Connect WhatsApp');

  if (pending) {
    title = 'Send the code from WhatsApp';
    description = `From the WhatsApp number that should get alerts, send this message to ${pending.businessNumber}.`;
    actions = (
      <div className="flex flex-wrap items-center gap-2">
        <a className={cn(buttonVariants({ size: 'sm' }), 'bg-green-600 hover:bg-green-700')} href={pending.whatsappUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />Open WhatsApp
        </a>
        <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
      </div>
    );
  } else if (connection?.status === 'active') {
    icon = <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />;
    title = `Low-stock alerts go to WhatsApp ${connection.maskedNumber}`;
    description = status.available
      ? 'Reply STOP in WhatsApp at any time to pause them.'
      : status.message ?? 'WhatsApp alerts are not currently available for this farm.';
    actions = disconnectControls;
  } else if (connection?.status === 'paused') {
    icon = <PauseCircle className="h-5 w-5 text-amber-600" aria-hidden="true" />;
    title = 'WhatsApp alerts are paused';
    description = `You replied STOP. Send START to ${status.businessNumber ?? 'the StockIntel WhatsApp number'} to turn them back on.`;
    actions = disconnectControls;
  } else if (connection?.status === 'unreachable') {
    icon = <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />;
    title = `WhatsApp couldn't reach ${connection.maskedNumber}`;
    description = 'Connect again to use a different number.';
    actions = connectButton('Connect again');
  }

  return (
    <section aria-label="WhatsApp alerts" className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">{icon}</div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
            {pending && (
              <div className="space-y-1 pt-1">
                <code className="inline-block rounded-md border bg-muted px-3 py-1.5 font-mono text-base font-semibold tracking-wider">
                  JOIN {pending.code}
                </code>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  Waiting for your message. The code expires at {formatTime(pending.expiresAt)}.
                </p>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </div>
        </div>
        <div className="shrink-0">{actions}</div>
      </div>
    </section>
  );
}
