/**
 * POST /api/reports
 * Generates AI business reports using Claude — server-side only.
 * Keeps ANTHROPIC_API_KEY on the server; never exposed to the browser.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ApiError, requireUser } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    try {
    await requireUser(req);
    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
    }

    const payload = await req.json();
    const prompt = payload.prompt ?? payload.messages?.[0]?.content;
    const context = payload.context ?? '';
    const orgName = payload.orgName ?? 'IntelliStock';
    const industry = payload.industry ?? 'inventory';
    if (!prompt) return NextResponse.json({ error: 'Prompt required' }, { status: 400 });
    if (String(prompt).length > 5000 || String(context ?? '').length > 30000) {
        return NextResponse.json({ error: 'Request is too large' }, { status: 413 });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            system: `You are a business intelligence analyst for an ${industry} business called "${orgName}". 
Generate clear, professional, markdown-formatted reports. Use headings, bullets, tables. Be specific with numbers. Under 600 words.`,
            messages: [{ role: 'user', content: `${prompt}\n\n${context}` }],
        }),
    });

    if (!res.ok) return NextResponse.json({ error: `AI error ${res.status}` }, { status: 502 });
    const data = await res.json();
    return NextResponse.json({ report: data.content?.[0]?.text ?? '' });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status });
    }
}
