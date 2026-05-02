/**
 * POST /api/prescriptions
 * Digitizes a handwritten/printed prescription image using Claude Vision.
 * Returns structured patient and drug data extracted from the image.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';


export async function POST(req: NextRequest) {
    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    const formData  = await req.formData();
    const file      = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const bytes  = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mime   = file.type || 'image/jpeg';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type':      'application/json',
            'x-api-key':         process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model:      'claude-sonnet-4-20250514',
            max_tokens: 800,
            system: `You are a medical OCR system for an Indian pharmacy. Extract prescription data and return ONLY valid JSON — no markdown, no prose.

Schema:
{
  "patientName": string,
  "age": string,
  "doctorName": string,
  "date": string,
  "drugs": [{ "name": string, "dosage": string, "duration": string, "instructions": string }],
  "notes": string,
  "confidence": "high"|"medium"|"low"
}

If you cannot read a field, use an empty string. Never invent data.`,
            messages: [{
                role: 'user',
                content: [
                    {
                        type:   'image',
                        source: { type: 'base64', media_type: mime, data: base64 },
                    },
                    {
                        type: 'text',
                        text: 'Extract all prescription information from this image.',
                    },
                ],
            }],
        }),
    });

    if (!response.ok) {
        return NextResponse.json({ error: 'AI processing failed' }, { status: 502 });
    }

    const data = await response.json();
    const text = (data.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim();

    try {
        return NextResponse.json(JSON.parse(text));
    } catch {
        return NextResponse.json({ error: 'Could not parse prescription data' }, { status: 502 });
    }
}
