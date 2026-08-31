/**
 * export.ts — client-side CSV and PDF export utilities
 * Uses only browser APIs — no Node.js fs module.
 */

export interface ExportRow {
    [key: string]: string | number | boolean | null | undefined;
}

export function exportToCSV(data: ExportRow[], filename: string): void {
    if (!data.length) throw new Error('No data to export');

    const headers = Object.keys(data[0]);
    const escape = (value: unknown) => {
        const text = String(value ?? '');
        const spreadsheetSafe = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
        return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
    };

    const csv = [
        headers.map(escape).join(','),
        ...data.map(row => headers.map(h => escape(row[h])).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export async function exportToPDF(
    elementId: string,
    filename  = 'report.pdf',
    title     = 'IntelliStock Report',
): Promise<void> {
    const el = document.getElementById(elementId);
    if (!el) throw new Error(`Element #${elementId} not found`);

    // Open a print window with the element's HTML
    const win = window.open('', '_blank');
    if (!win) throw new Error('Popup blocked — please allow popups for this site');

    const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
    const documentStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(node => node.outerHTML).join('\n');
    win.document.write(`
        <!DOCTYPE html>
        <html><head>
        <title>${escapeHtml(filename.replace(/\.pdf$/i, ''))}</title>
        ${documentStyles}
        <style>
            body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; color: #111827; background: white; }
            table { width: 100%; border-collapse: collapse; margin: 12px 0; }
            th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
            th { background: #f5f5f5; font-weight: 600; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            h2 { font-size: 15px; margin: 16px 0 6px; color: #444; }
            .meta { color: #888; font-size: 11px; margin-bottom: 16px; }
            @media print { @page { size: landscape; margin: 10mm; } button { display: none !important; } body { padding: 0; } }
        </style>
        </head><body>
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">Generated: ${new Date().toLocaleString()} · IntelliStock AI</p>
        ${el.innerHTML}
        <script>window.onload = () => window.print();<\/script>
        </body></html>
    `);
    win.document.close();
}

export function formatDataForExport(
    data: ExportRow[],
    dateFields: string[] = [],
): ExportRow[] {
    return data.map(row => {
        const formatted: ExportRow = { ...row };
        for (const field of dateFields) {
            if (formatted[field]) {
                formatted[field] = new Date(formatted[field] as string).toLocaleDateString();
            }
        }
        return formatted;
    });
}

// ─── Internal helper ──────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
