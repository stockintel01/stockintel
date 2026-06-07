/**
 * POST /api/consultation
 * Provider-selectable AI drug recommendation grounded in live inventory.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ApiError, requireUser } from '@/lib/api-auth';
import { generateAiText, getAiProvider } from '@/lib/ai-provider';

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
    try {
    await requireUser(request);
    const { symptoms, patientAge, patientWeight, isPregnant, existingConditions, inventory }: ConsultationRequest
        = await request.json();

    if (!symptoms?.trim()) return NextResponse.json({ error: 'Symptoms required' }, { status: 400 });
    if (symptoms.length > 5000 || !Array.isArray(inventory) || inventory.length > 1000) {
        return NextResponse.json({ error: 'Request is too large' }, { status: 413 });
    }
    if (!getAiProvider()) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

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
        const text = await generateAiText({ system, prompt: userMsg, maxTokens: 1500, json: true });
        const result: ConsultationResponse = JSON.parse(text);

        // Safety: only return recs whose itemId actually exists in inventory
        result.recommendations = result.recommendations.filter(r => inStock.some(i => i.id === r.itemId));

        return NextResponse.json(result);
    } catch (err) {
        console.error('[consultation]', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : 'AI error' }, { status: 502 });
    }
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status });
    }
}
