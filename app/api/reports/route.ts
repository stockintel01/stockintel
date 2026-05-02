/**
 * POST /api/reports
 * Generates AI business reports using Claude — server-side only.
 * Keeps ANTHROPIC_API_KEY on the server; never exposed to the browser.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
    }

    const { prompt, context, orgName, industry } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'Prompt required' }, { status: 400 });

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
}
