'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    Brain, Sparkles, AlertTriangle, Stethoscope,
    ShieldAlert, Clock, CheckCircle2, Loader2,
    Pill, ChevronRight, Info, Download, Save
} from 'lucide-react';

interface DrugRecommendation {
    itemId: string; name: string; dosage: string; duration: string;
    instructions: string; urgency: 'urgent' | 'standard' | 'optional'; warnings: string[];
}
interface ConsultationResult {
    assessment: string; recommendations: DrugRecommendation[];
    interactions: string[]; redFlags: string[]; disclaimer: string;
}

const URGENCY_CONFIG = {
    urgent:   { label: 'Urgent',   color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-950/30',    border: 'border-red-200 dark:border-red-800',    icon: ShieldAlert  },
    standard: { label: 'Standard', color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-950/30',  border: 'border-blue-200 dark:border-blue-800',  icon: CheckCircle2 },
    optional: { label: 'Optional', color: 'text-emerald-600',bg: 'bg-emerald-50 dark:bg-emerald-950/30',border:'border-emerald-200 dark:border-emerald-800',icon: Info },
};

export default function ConsultationPage() {
    const { inventory, currency, organization, user } = useAppStore();

    const [symptoms, setSymptoms]         = useState('');
    const [age, setAge]                   = useState('');
    const [weight, setWeight]             = useState('');
    const [pregnant, setPregnant]         = useState(false);
    const [conditions, setConditions]     = useState('');
    const [isAnalyzing, setIsAnalyzing]   = useState(false);
    const [result, setResult]             = useState<ConsultationResult | null>(null);
    const [error, setError]               = useState('');
    const [savedToHistory, setSavedToHistory] = useState(false);

    const saveConsultationHistory = async (consultResult: ConsultationResult) => {
        if (!organization?.id || !user?.id) return;
        try {
            await addDoc(collection(db, `organizations/${organization.id}/consultations`), {
                symptoms, age: age ? parseInt(age) : null,
                weight: weight ? parseFloat(weight) : null,
                pregnant, conditions,
                result: consultResult,
                createdBy: user.id,
                createdAt: serverTimestamp(),
            });
            setSavedToHistory(true);
        } catch (err) { console.warn('[consultation] Failed to save history:', err); }
    };

    const handlePrint = () => {
        if (!result) return;
        const lines = [
            `AI CONSULTATION REPORT`,
            `Date: ${new Date().toLocaleString()}`,
            `Patient: Age ${age || 'N/A'}, Weight ${weight || 'N/A'}kg${pregnant ? ', Pregnant' : ''}`,
            `Symptoms: ${symptoms}`,
            ``,
            `ASSESSMENT:`,
            result.assessment,
            ``,
            `RECOMMENDATIONS:`,
            ...result.recommendations.map(r => `• ${r.name} ${r.dosage} — ${r.duration}\n  ${r.instructions}`),
            ``,
            result.disclaimer,
        ];
        const w = window.open('', '_blank');
        if (w) { w.document.write(`<pre style="font-family:monospace;padding:20px">${lines.join('\n')}</pre>`); w.print(); }
    };

    const handleAnalyze = async () => {
        if (!symptoms.trim()) return;
        setIsAnalyzing(true); setResult(null); setError('');

        try {
            const res = await fetch('/api/consultation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symptoms,
                    patientAge:          age ? parseInt(age) : undefined,
                    patientWeight:       weight ? parseFloat(weight) : undefined,
                    isPregnant:          pregnant,
                    existingConditions:  conditions ? conditions.split(',').map(s => s.trim()) : [],
                    inventory: inventory.map(i => ({
                        id: i.id, name: i.name, sku: i.sku,
                        category: i.category, quantity: i.quantity, mrp: i.mrp,
                    })),
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error ?? `Request failed (${res.status})`);
            }
            const consultResult = await res.json();
            setResult(consultResult);
            setSavedToHistory(false);
            await saveConsultationHistory(consultResult);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Consultation failed. Please try again.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="grid lg:grid-cols-2 gap-6 h-[calc(100vh-8rem)]">

            {/* ── Left: Input ───────────────────────────────────────────────── */}
            <div className="space-y-5 flex flex-col">
                <div>
                    <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Brain className="w-8 h-8 text-primary" /> AI Consultation
                    </h1>
                    </div>
                    {result && (
                        <div className="flex gap-2">
                            {savedToHistory && <span className="text-xs text-green-600 flex items-center gap-1"><Save className="w-3 h-3" /> Saved</span>}
                            <Button variant="outline" size="sm" onClick={handlePrint}><Download className="w-4 h-4 mr-1" /> Print</Button>
                        </div>
                    )}
                    <p className="text-muted-foreground mt-1 text-sm">
                        Powered by Claude — grounded in your live inventory ({inventory.filter(i => i.quantity > 0).length} items in stock).
                    </p>
                </div>

                <Card className="flex-1">
                    <CardHeader><CardTitle className="text-base">Patient Assessment</CardTitle></CardHeader>
                    <CardContent className="space-y-4">

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="age">Age (years)</Label>
                                <Input id="age" type="number" placeholder="e.g. 35"
                                    value={age} onChange={e => setAge(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="weight">Weight (kg)</Label>
                                <Input id="weight" type="number" placeholder="e.g. 70"
                                    value={weight} onChange={e => setWeight(e.target.value)} />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 border rounded-lg">
                            <input type="checkbox" id="pregnant" checked={pregnant}
                                onChange={e => setPregnant(e.target.checked)}
                                className="w-4 h-4 accent-primary" />
                            <label htmlFor="pregnant" className="text-sm font-medium cursor-pointer">
                                Patient is pregnant
                            </label>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="conditions">Existing conditions / allergies</Label>
                            <Input id="conditions" placeholder="e.g. Diabetes, Penicillin allergy (comma-separated)"
                                value={conditions} onChange={e => setConditions(e.target.value)} />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="symptoms">Symptoms & Presenting Complaint *</Label>
                            <textarea
                                id="symptoms"
                                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                                placeholder="e.g. High fever 39°C for 2 days, body ache, mild sore throat, no cough…"
                                value={symptoms}
                                onChange={e => setSymptoms(e.target.value)}
                            />
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}
                            </div>
                        )}

                        <Button className="w-full h-11 text-base"
                            onClick={handleAnalyze}
                            disabled={isAnalyzing || !symptoms.trim()}>
                            {isAnalyzing ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing with Claude…</>
                            ) : (
                                <><Sparkles className="w-4 h-4 mr-2" />Generate Recommendations</>
                            )}
                        </Button>

                        <p className="text-xs text-muted-foreground text-center">
                            Results are AI-generated and must be verified by a licensed pharmacist.
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* ── Right: Output ─────────────────────────────────────────────── */}
            <div className="overflow-y-auto space-y-4 pr-1">

                {!result && !isAnalyzing && (
                    <div className="flex flex-col items-center justify-center h-full text-center border-2 border-dashed rounded-2xl bg-muted/10 p-10">
                        <Stethoscope className="w-16 h-16 mb-4 opacity-15" />
                        <h3 className="text-lg font-semibold mb-2">Ready to Assist</h3>
                        <p className="text-muted-foreground text-sm max-w-xs">
                            Enter patient details and symptoms, then click Generate. Claude will match drugs to your live inventory.
                        </p>
                    </div>
                )}

                {isAnalyzing && (
                    <div className="flex flex-col items-center justify-center h-full text-center p-10">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                            <Brain className="w-8 h-8 text-primary animate-pulse" />
                        </div>
                        <p className="font-semibold text-lg mb-2">Analyzing symptoms…</p>
                        <p className="text-muted-foreground text-sm">Claude is reviewing your inventory and patient details.</p>
                    </div>
                )}

                {result && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

                        {/* Assessment */}
                        <Card className="border-primary/30 bg-primary/5">
                            <CardContent className="p-4 flex gap-3">
                                <Brain className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-primary uppercase tracking-wide mb-1">Clinical Assessment</p>
                                    <p className="text-sm leading-relaxed">{result.assessment}</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Red flags */}
                        {result.redFlags.length > 0 && (
                            <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
                                <CardContent className="p-4">
                                    <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                                        <ShieldAlert className="w-3.5 h-3.5" /> Red Flags — Refer to Physician
                                    </p>
                                    <ul className="space-y-1">
                                        {result.redFlags.map((flag, i) => (
                                            <li key={i} className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                                                <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />{flag}
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )}

                        {/* Recommendations */}
                        <div>
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                                Recommended Treatment ({result.recommendations.length} drug{result.recommendations.length !== 1 ? 's' : ''})
                            </h3>
                            <div className="space-y-3">
                                {result.recommendations.length === 0 ? (
                                    <Card className="p-6 text-center text-muted-foreground text-sm">
                                        No matching drugs found in your current inventory for this condition.
                                    </Card>
                                ) : result.recommendations.map((rec, i) => {
                                    const uc = URGENCY_CONFIG[rec.urgency];
                                    const invItem = inventory.find(inv => inv.id === rec.itemId);
                                    return (
                                        <Card key={i} className={cn('border-l-4', uc.border)}>
                                            <CardContent className="p-4">
                                                <div className="flex items-start justify-between gap-3 mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', uc.bg)}>
                                                            <Pill className={cn('w-4 h-4', uc.color)} />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-sm">{rec.name}</p>
                                                            <p className="text-xs text-muted-foreground">{rec.dosage} · {rec.duration}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                                        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', uc.bg, uc.color)}>
                                                            {uc.label}
                                                        </span>
                                                        {invItem && (
                                                            <span className="text-xs text-muted-foreground font-mono">
                                                                {currency}{invItem.mrp} · {invItem.quantity} in stock
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <p className="text-sm text-muted-foreground mb-2">
                                                    <span className="font-medium text-foreground">Instructions:</span> {rec.instructions}
                                                </p>

                                                {rec.warnings.length > 0 && (
                                                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 mt-2">
                                                        {rec.warnings.map((w, wi) => (
                                                            <p key={wi} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                                                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Interactions */}
                        {result.interactions.length > 0 && (
                            <Card>
                                <CardContent className="p-4">
                                    <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2 flex items-center gap-1">
                                        <AlertTriangle className="w-3.5 h-3.5" /> Drug Interactions
                                    </p>
                                    {result.interactions.map((ia, i) => (
                                        <p key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                            <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />{ia}
                                        </p>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {/* Disclaimer */}
                        <p className="text-xs text-muted-foreground text-center p-3 border rounded-lg bg-muted/30">
                            {result.disclaimer}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
