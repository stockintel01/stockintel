import { NextRequest, NextResponse } from 'next/server';
import { ApiError, requireFeature, requireUser } from '@/lib/api-auth';
import { generateAiText, getAiProvider } from '@/lib/ai-provider';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    try {
        const user = await requireUser(req);
        requireFeature(user, 'ai');
        if (!getAiProvider()) return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });

        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 413 });
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
            return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });
        }

        const text = await generateAiText({
            system: `You are a medical OCR system for a pharmacy. Return only valid JSON.
Schema: {"patientName":string,"age":string,"doctorName":string,"date":string,"drugs":[{"name":string,"dosage":string,"duration":string,"instructions":string}],"notes":string,"confidence":"high"|"medium"|"low"}
Use an empty string for unreadable fields. Never invent data.`,
            prompt: 'Extract all prescription information from this uploaded document.',
            maxTokens: 800,
            json: true,
            attachment: {
                base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
                mimeType: file.type,
                filename: file.name,
            },
        });
        return NextResponse.json(JSON.parse(text));
    } catch (error) {
        const status = error instanceof ApiError ? error.status : error instanceof SyntaxError ? 502 : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status });
    }
}
