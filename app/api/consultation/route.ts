/**
 * POST /api/consultation
 * Real AI drug recommendation using Claude — inventory-grounded.
 * Requires: ANTHROPIC_API_KEY env var.
 */

import { NextRequest, NextResponse } from 'next/server';

interface InventoryItem { id: string; name: string; sku: string; category: string; quantity: number; mrp: number; }
interface ConsultationRequest {
    symptoms: string; patientAge?: number; patientWeight?: number;
    isPregnant?: boolean; existingConditions?: string[]; inventory: InventoryItem[];
}
interface DrugRecommendation {
    itemId: string; name: string; dosage: string; duration: string;
    instructions: string; urgency: 'urgent'|'standard'|'optional'; warnings: string[];
}
interface ConsultationResponse {
    assessment: string; recommendations: DrugRecommendation[];
    interactions: string[]; redFlags: string[]; disclaimer: string;
}

export async function POST(request: NextRequest) {
    const { symptoms, patientAge, patientWeight, isPregnant, existingConditions, inventory }: ConsultationRequest
        = await request.json();

    if (!symptoms?.trim()) return NextResponse.json({ error: 'Symptoms required' }, { status: 400 });
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

    const inStock = inventory.filter(i => i.quantity > 0);
    const inventoryList = inStock.map(i =>
        `ID:${i.id} | ${i.name} | ${i.category} | Stock:${i.quantity} | MRP:${i.mrp}`
    ).join('\n');

    const patient = [
        patientAge    ? `Age: ${patientAge}yr`       : '',
        patientWeight ? `Weight: ${patientWeight}kg`  : '',
        isPregnant    ? 'Pregnant'                    : '',
        existingConditions?.join(', '),
    ].filter(Boolean).join(', ') || 'Not specified';

    const system = `You are a clinical pharmacist AI for an Indian pharmacy. 
Recommend drugs ONLY from the provided inventory (by exact itemId). 
Respond with valid JSON only — no markdown, no prose outside JSON.

Schema: { "assessment": string, "recommendations": [{ "itemId": string, "name": string, "dosage": string, "duration": string, "instructions": string, "urgency": "urgent"|"standard"|"optional", "warnings": string[] }], "interactions": string[], "redFlags": string[], "disclaimer": string }`;

    const userMsg = `Symptoms: ${symptoms}\nPatient: ${patient}\n\nInventory (recommend only from this):\n${inventoryList}`;

    try {
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
                system,
                messages: [{ role: 'user', content: userMsg }],
            }),
        });

        if (!res.ok) throw new Error(`Claude API ${res.status}`);
        const data = await res.json();
        const text = (data.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim();
        const result: ConsultationResponse = JSON.parse(text);

        // Safety: only return recs whose itemId actually exists in inventory
        result.recommendations = result.recommendations.filter(r => inStock.some(i => i.id === r.itemId));

        return NextResponse.json(result);
    } catch (err) {
        console.error('[consultation]', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : 'AI error' }, { status: 502 });
    }
}
