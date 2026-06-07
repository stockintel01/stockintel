export type AiProvider = 'openai' | 'gemini' | 'anthropic';

interface GenerateAiOptions {
    system: string;
    prompt: string;
    maxTokens?: number;
    json?: boolean;
    attachment?: { base64: string; mimeType: string; filename?: string };
}

export function getAiProvider(): AiProvider | null {
    const configured = process.env.AI_PROVIDER?.toLowerCase();
    if (configured && configured !== 'auto') {
        if (configured === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
        if (configured === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
        if (configured === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
        return null;
    }
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.GEMINI_API_KEY) return 'gemini';
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    return null;
}

async function openAi(options: GenerateAiOptions): Promise<string> {
    const content: Array<Record<string, unknown>> = [{ type: 'input_text', text: options.prompt }];
    if (options.attachment?.mimeType === 'application/pdf') {
        content.unshift({
            type: 'input_file',
            filename: options.attachment.filename ?? 'document.pdf',
            file_data: `data:${options.attachment.mimeType};base64,${options.attachment.base64}`,
        });
    } else if (options.attachment) {
        content.unshift({ type: 'input_image', detail: 'high', image_url: `data:${options.attachment.mimeType};base64,${options.attachment.base64}` });
    }
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
            instructions: options.system,
            input: [{ role: 'user', content }],
            max_output_tokens: options.maxTokens ?? 1500,
            ...(options.json ? { text: { format: { type: 'json_object' } } } : {}),
        }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? `OpenAI API ${response.status}`);
    return data.output_text ?? data.output?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? []).map((item: { text?: string }) => item.text ?? '').join('') ?? '';
}

async function gemini(options: GenerateAiOptions): Promise<string> {
    const parts: Array<Record<string, unknown>> = [{ text: options.prompt }];
    if (options.attachment) parts.unshift({ inlineData: { mimeType: options.attachment.mimeType, data: options.attachment.base64 } });
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: options.system }] },
            contents: [{ role: 'user', parts }],
            generationConfig: { maxOutputTokens: options.maxTokens ?? 1500, ...(options.json ? { responseMimeType: 'application/json' } : {}) },
        }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? `Gemini API ${response.status}`);
    return data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('') ?? '';
}

async function anthropic(options: GenerateAiOptions): Promise<string> {
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: options.prompt }];
    if (options.attachment) content.unshift({
        type: options.attachment.mimeType === 'application/pdf' ? 'document' : 'image',
        source: { type: 'base64', media_type: options.attachment.mimeType, data: options.attachment.base64 },
    });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
            max_tokens: options.maxTokens ?? 1500,
            system: options.system,
            messages: [{ role: 'user', content }],
        }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? `Anthropic API ${response.status}`);
    return data.content?.map((part: { text?: string }) => part.text ?? '').join('') ?? '';
}

export async function generateAiText(options: GenerateAiOptions): Promise<string> {
    const provider = getAiProvider();
    if (!provider) throw new Error('AI provider is not configured');
    const text = provider === 'openai' ? await openAi(options) : provider === 'gemini' ? await gemini(options) : await anthropic(options);
    if (!text.trim()) throw new Error(`${provider} returned an empty response`);
    return options.json ? text.replace(/```json|```/gi, '').trim() : text;
}
