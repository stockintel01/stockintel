'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ImportPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [file, setFile] = useState<File | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [previewData, setPreviewData] = useState<any[]>([]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
        }
    };

    const processFile = () => {
        // Mock parsing logic
        setPreviewData([
            { name: 'Legacy Item A', sku: 'LEG-001', qty: 50, price: 100 },
            { name: 'Legacy Item B', sku: 'LEG-002', qty: 120, price: 45 },
            { name: 'Legacy Item C', sku: 'LEG-003', qty: 10, price: 1200 },
        ]);
        setStep(2);
    };

    const commitData = () => {
        // Save to store logic would go here
        router.push('/dashboard/inventory');
    };

    const downloadTemplate = () => {
        // Create CSV template with headers
        const headers = ['Item Name', 'SKU', 'Batch Number', 'Expiry Date (YYYY-MM-DD)', 'Quantity', 'Unit', 'MRP', 'Category', 'Location'];
        const sampleData = [
            ['Paracetamol 650mg', 'PCM-650', 'B202401', '2027-05-26', '1500', 'Tablets', '2.5', 'Medicine', 'Rack A1'],
            ['Amoxicillin 500mg', 'AMX-500', 'B202402', '2026-03-27', '300', 'Capsules', '12.0', 'Antibiotic', 'Rack B3'],
            ['Vitamin C 500mg', 'VIT-C-500', 'B202403', '2027-01-21', '800', 'Tablets', '5.0', 'Supplement', 'Rack A2'],
        ];

        // Combine headers and sample data
        const csvContent = [
            headers.join(','),
            ...sampleData.map(row => row.join(','))
        ].join('\n');

        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', 'inventory_import_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Bulk Data Import</h1>
                <p className="text-muted-foreground">Migrate your existing inventory from Excel or CSV.</p>
            </div>

            <div className="flex items-center gap-4 mb-8">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>1</div>
                <div className="h-1 flex-1 bg-muted">
                    <div className={`h-full bg-primary transition-all duration-500 ${step >= 2 ? 'w-full' : 'w-0'}`} />
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>2</div>
                <div className="h-1 flex-1 bg-muted">
                    <div className={`h-full bg-primary transition-all duration-500 ${step >= 3 ? 'w-full' : 'w-0'}`} />
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>3</div>
            </div>

            {step === 1 && (
                <Card>
                    <CardHeader>
                        <CardTitle>1. Upload File</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center space-y-4 hover:bg-muted/50 transition-colors cursor-pointer relative">
                            <FileSpreadsheet className="w-12 h-12 text-muted-foreground" />
                            <div className="space-y-1">
                                <p className="font-medium">Drag and drop your Excel/CSV file here</p>
                                <p className="text-xs text-muted-foreground">or click to browse</p>
                            </div>
                            <Input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileChange} />
                        </div>

                        {file && (
                            <div className="flex items-center gap-3 p-3 bg-green-50 text-green-700 rounded-lg">
                                <CheckCircle className="w-5 h-5" />
                                <span className="font-medium">{file.name}</span>
                            </div>
                        )}

                        <div className="flex justify-between">
                            <Button variant="outline" onClick={downloadTemplate}>Download Template</Button>
                            <Button disabled={!file} onClick={processFile}>Continue <Upload className="w-4 h-4 ml-2" /></Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {step === 2 && (
                <Card>
                    <CardHeader>
                        <CardTitle>2. Verify Data</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="rounded-md border">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted">
                                    <tr>
                                        <th className="p-3">Item Name</th>
                                        <th className="p-3">SKU</th>
                                        <th className="p-3">Quantity</th>
                                        <th className="p-3">Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.map((row, i) => (
                                        <tr key={i} className="border-t">
                                            <td className="p-3">{row.name}</td>
                                            <td className="p-3">{row.sku}</td>
                                            <td className="p-3">{row.qty}</td>
                                            <td className="p-3">₹{row.price}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 p-3 rounded-lg">
                            <AlertCircle className="w-4 h-4" />
                            <span>3 items ready to import. Please check for errors.</span>
                        </div>

                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                            <Button onClick={commitData}>Import Data</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

        </div>
    );
}
