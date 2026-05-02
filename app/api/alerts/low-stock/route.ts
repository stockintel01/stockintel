/**
 * POST /api/alerts/low-stock
 *
 * Sends WhatsApp + SMS low-stock alerts via Twilio REST API (no SDK).
 *
 * Env vars required:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER       (SMS)
 *   TWILIO_WHATSAPP_FROM     (WhatsApp sandbox/approved number)
 *   ALERT_WEBHOOK_SECRET     (shared secret for the x-intellistock-secret header)
 */

import { NextRequest, NextResponse } from 'next/server';

interface AlertItem {
    name: string; sku: string; quantity: number; reorderLevel: number; location: string;
}
interface Recipient {
    name: string; phone: string; channel: 'whatsapp' | 'sms';
}
interface AlertRequest {
    orgId: string; orgName: string; items: AlertItem[]; recipients: Recipient[];
}

async function sendTwilioMessage(to: string, from: string, body: string, sid: string, token: string) {
    const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
        }
    );
    const data = await res.json();
    return res.ok ? { success: true, sid: data.sid } : { success: false, error: data.message };
}

function buildMessage(orgName: string, items: AlertItem[]): string {
    const lines = items.map(i =>
        `  • ${i.name} (${i.sku})\n    Stock: ${i.quantity} | Reorder at: ${i.reorderLevel} | ${i.location}`
    ).join('\n');
    return `🚨 *Low Stock Alert — ${orgName}*\n\n${items.length} item${items.length > 1 ? 's' : ''} need restocking:\n\n${lines}\n\n⏰ ${new Date().toLocaleString()}\n\n_Sent by IntelliStock AI_`;
}

export async function POST(request: NextRequest) {
    if (request.headers.get('x-intellistock-secret') !== process.env.ALERT_WEBHOOK_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountSid, authToken, fromSms, fromWa } = {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken:  process.env.TWILIO_AUTH_TOKEN,
        fromSms:    process.env.TWILIO_FROM_NUMBER,
        fromWa:     process.env.TWILIO_WHATSAPP_FROM,
    };

    if (!accountSid || !authToken) {
        return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
    }

    const body: AlertRequest = await request.json();
    const { orgName, items, recipients } = body;
    if (!items?.length || !recipients?.length) {
        return NextResponse.json({ error: 'items and recipients required' }, { status: 400 });
    }

    const message = buildMessage(orgName, items);

    const results = await Promise.all(recipients.map(async (r) => {
        const isWa = r.channel === 'whatsapp';
        const from = isWa ? (fromWa ?? '') : (fromSms ?? '');
        const to   = isWa ? `whatsapp:${r.phone}` : r.phone;
        if (!from) return { recipient: r.phone, channel: r.channel, success: false, error: 'FROM not set' };
        return { recipient: r.phone, channel: r.channel, ...(await sendTwilioMessage(to, from, message, accountSid, authToken)) };
    }));

    const sent = results.filter(r => r.success).length;
    return NextResponse.json({ sent, failed: results.length - sent, total: results.length, results });
}

export async function GET() {
    return NextResponse.json({
        status: 'ok',
        configured: {
            twilio:   !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
            whatsapp: !!process.env.TWILIO_WHATSAPP_FROM,
            sms:      !!process.env.TWILIO_FROM_NUMBER,
        },
    });
}
