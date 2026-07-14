/**
 * POST /api/reports
 * Generates provider-selectable AI business reports server-side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ApiError, requireFeature, requireUser } from '@/lib/api-auth';
import { generateAiText, getAiProvider } from '@/lib/ai-provider';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    try {
    const user = await requireUser(req);
    requireFeature(user, 'advancedReports');
    if (!getAiProvider()) {
        return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
    }

    const payload = await req.json();
    const prompt = payload.prompt ?? payload.messages?.[0]?.content;
    const context = payload.context ?? '';
    const orgName = payload.orgName ?? 'IntelliStock';
    const industry = payload.industry ?? 'agriculture';
    if (!prompt) return NextResponse.json({ error: 'Prompt required' }, { status: 400 });
    if (String(prompt).length > 5000 || String(context ?? '').length > 30000) {
        return NextResponse.json({ error: 'Request is too large' }, { status: 413 });
    }

    const report = await generateAiText({
        system: `You are a business intelligence analyst for an ${industry} organization called "${orgName}". Generate clear, professional, markdown-formatted agriculture reports. Use headings, bullets, tables. Be specific with numbers. Under 600 words.`,
        prompt: `${prompt}\n\n${context}`,
        maxTokens: 1500,
    });
    return NextResponse.json({ report });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status });
    }
}
