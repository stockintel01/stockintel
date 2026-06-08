'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { bulkImport } from '@/lib/inventory-service';
import { parseInventoryFile, type InventoryImportResult } from '@/lib/inventory-import';
import { cn } from '@/lib/utils';
import { getPlanLimit } from '@/lib/plans';
import { isSuperAdminEmail } from '@/lib/access-control';

const ACCEPTED_FILES = '.csv,.xlsx';

export default function ImportPage() {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const { organization, user, activeIndustry, currency, inventory } = useAppStore();
    const [step, setStep] = useState(1);
    const [file, setFile] = useState<File | null>(null);
    const [result, setResult] = useState<InventoryImportResult | null>(null);
    const [dragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [written, setWritten] = useState(0);

    async function selectFile(selected?: File) {
        if (!selected) return;
        setFile(selected);
        setResult(null);
        setError('');
        setLoading(true);
        try {
            setResult(await parseInventoryFile(selected));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to read this file.');
        } finally {
            setLoading(false);
        }
    }

    function handleDrop(event: React.DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setDragging(false);
        void selectFile(event.dataTransfer.files[0]);
    }

    async function commitData() {
        if (!result?.items.length || !organization?.id || !user?.id) {
            setError('A signed-in organization and at least one valid row are required.');
            return;
        }
        const limit = getPlanLimit(organization.subscription, 'inventoryItems', isSuperAdminEmail(user.email));
        const remaining = limit - inventory.length;
        if (result.items.length > remaining) {
            setError(`This import exceeds your plan limit. You can add ${Math.max(remaining, 0)} more inventory items.`);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const count = await bulkImport(organization.id, result.items, user.id);
            setWritten(count);
            setStep(3);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed. Check Firebase permissions and try again.');
        } finally {
            setLoading(false);
        }
    }

    function downloadTemplate() {
        const rows = [
            ['Item Name', 'SKU', 'Batch Number', 'Expiry Date (YYYY-MM-DD)', 'Quantity', 'Unit', 'MRP', 'Cost Price', 'Category', 'Location'],
            ['Sample Item', 'SAMPLE-001', 'BATCH-001', '2027-12-31', '100', 'Units', '12.50', '8.25', 'General', 'Main Store'],
        ];
        const csv = rows.map(row => row.map(value => `"${value}"`).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${activeIndustry}-inventory-import-template.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Bulk Inventory Import</h1>
                <p className="text-muted-foreground">Import up to 5,000 inventory items from CSV or Excel.</p>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {step === 1 && (
                <Card>
                    <CardHeader><CardTitle>Upload and validate file</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <input
                            ref={inputRef}
                            type="file"
                            accept={ACCEPTED_FILES}
                            className="hidden"
                            onChange={event => void selectFile(event.target.files?.[0])}
                        />
                        <div
                            role="button"
                            tabIndex={0}
                            className={cn(
                                'border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center space-y-4 cursor-pointer transition-colors',
                                dragging ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                            )}
                            onClick={() => inputRef.current?.click()}
                            onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
                            }}
                            onDragEnter={event => { event.preventDefault(); setDragging(true); }}
                            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true); }}
                            onDragLeave={event => {
                                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
                            }}
                            onDrop={handleDrop}
                        >
                            {loading ? <Loader2 className="w-12 h-12 animate-spin text-primary" /> : <FileSpreadsheet className="w-12 h-12 text-muted-foreground" />}
                            <div>
                                <p className="font-medium">Drag and drop your CSV or Excel file here</p>
                                <p className="text-xs text-muted-foreground">or click to browse · CSV or XLSX · maximum 10 MB</p>
                            </div>
                        </div>

                        {file && (
                            <div className="flex items-center gap-3 p-3 bg-green-50 text-green-700 rounded-lg">
                                <CheckCircle className="w-5 h-5 shrink-0" />
                                <span className="font-medium truncate">{file.name}</span>
                                {result && <span className="ml-auto text-sm">{result.items.length} valid of {result.totalRows}</span>}
                            </div>
                        )}

                        <div className="flex justify-between gap-3">
                            <Button variant="outline" onClick={downloadTemplate}>Download Template</Button>
                            <Button disabled={!result?.items.length || loading} onClick={() => setStep(2)}>
                                Review Import <Upload className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {step === 2 && result && (
                <Card>
                    <CardHeader><CardTitle>Review valid inventory rows</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="rounded-md border overflow-x-auto max-h-96">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted sticky top-0">
                                    <tr><th className="p-3">Item</th><th className="p-3">SKU</th><th className="p-3">Quantity</th><th className="p-3">Price</th><th className="p-3">Category</th></tr>
                                </thead>
                                <tbody>
                                    {result.items.map((row, index) => (
                                        <tr key={`${row.sku}-${index}`} className="border-t">
                                            <td className="p-3">{row.name}</td><td className="p-3">{row.sku}</td>
                                            <td className="p-3">{row.quantity}</td><td className="p-3">{currency}{row.mrp.toLocaleString()}</td>
                                            <td className="p-3">{row.category}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className={cn('flex items-start gap-2 text-sm p-3 rounded-lg', result.errors.length ? 'text-amber-700 bg-amber-50' : 'text-green-700 bg-green-50')}>
                            {result.errors.length ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                            <div>
                                <p>{result.items.length} valid items ready to import. Existing SKUs will be skipped.</p>
                                {result.errors.slice(0, 10).map(message => <p key={message} className="mt-1">{message}</p>)}
                                {result.errors.length > 10 && <p className="mt-1">And {result.errors.length - 10} more row errors.</p>}
                            </div>
                        </div>

                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                            <Button disabled={loading} onClick={() => void commitData()}>
                                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Import {result.items.length} Items
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {step === 3 && (
                <Card>
                    <CardContent className="py-12 text-center space-y-4">
                        <CheckCircle className="w-14 h-14 text-green-600 mx-auto" />
                        <h2 className="text-2xl font-bold">Import complete</h2>
                        <p className="text-muted-foreground">{written} new items were added. Existing SKUs were safely skipped.</p>
                        <Button onClick={() => router.push('/dashboard/inventory')}>View Inventory</Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
