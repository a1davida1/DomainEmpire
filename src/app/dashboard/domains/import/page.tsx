'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft,
    Upload,
    FileSpreadsheet,
    CheckCircle2,
    XCircle,
    Loader2,
    Download,
    AlertCircle
} from 'lucide-react';

interface ImportResult {
    success: number;
    failed: number;
    errors: Array<{ domain: string; error: string }>;
    created: Array<{ id: string; domain: string }>;
}

export default function ImportDomainsPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState('');

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (!selectedFile.name.endsWith('.csv')) {
                setError('Please select a CSV file');
                return;
            }
            setFile(selectedFile);
            setError('');
            setResult(null);
        }
    }

    async function handleImport() {
        if (!file) return;

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/domains/import', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const contentType = response.headers.get("content-type");
                let errorMessage = 'Import failed';
                if (contentType && contentType.includes("application/json")) {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } else {
                    errorMessage = await response.text();
                }
                throw new Error(errorMessage || `Import failed (${response.status})`);
            }

            const data = await response.json();
            setResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    }

    function downloadTemplate() {
        const headers = [
            'domain',
            'registrar',
            'purchasePrice',
            'purchaseDate',
            'renewalDate',
            'renewalPrice',
            'status',
            'bucket',
            'tier',
            'niche',
            'subNiche',
            'siteTemplate',
            'notes',
            'tags',
        ];

        const exampleRow = [
            'example.com',
            'godaddy',
            '12.99',
            '2024-01-01',
            '2025-01-01',
            '18.99',
            'parked',
            'build',
            '1',
            'health',
            'therapy',
            'authority',
            'High potential domain',
            '"premium,health"',
        ];

        const csv = [headers.join(','), exampleRow.join(',')].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'domain_import_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/dashboard/domains">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Import Domains</h1>
                    <p className="text-muted-foreground">Bulk import domains from a CSV file</p>
                </div>
            </div>

            {/* Template Download */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" />
                        CSV Template
                    </CardTitle>
                    <CardDescription>
                        Download a template with all supported columns
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button variant="outline" onClick={downloadTemplate}>
                        <Download className="mr-2 h-4 w-4" />
                        Download Template
                    </Button>
                    <div className="mt-4 text-sm text-muted-foreground">
                        <p className="font-medium">Supported columns:</p>
                        <ul className="mt-1 list-inside list-disc space-y-1">
                            <li><code>domain</code> (required) - e.g., example.com</li>
                            <li><code>registrar</code> - godaddy, namecheap, cloudflare, other</li>
                            <li><code>purchasePrice</code> - number, e.g., 12.99</li>
                            <li><code>purchaseDate</code>, <code>renewalDate</code> - YYYY-MM-DD format</li>
                            <li><code>status</code> - parked, active, redirect, forsale, defensive</li>
                            <li><code>bucket</code> - build, redirect, park, defensive</li>
                            <li><code>tier</code> - 1, 2, or 3</li>
                            <li><code>niche</code>, <code>subNiche</code> - text</li>
                            <li><code>siteTemplate</code> - authority, comparison, calculator, review</li>
                            <li><code>tags</code> - comma-separated, e.g., &quot;premium,health&quot;</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* File Upload */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5" />
                        Upload CSV
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        className="hidden"
                    />

                    <div
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                fileInputRef.current?.click();
                            }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label="Upload CSV file"
                        className="cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center transition-colors hover:border-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        {file ? (
                            <div className="flex flex-col items-center gap-2">
                                <FileSpreadsheet className="h-10 w-10 text-green-500" />
                                <p className="font-medium">{file.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    {(file.size / 1024).toFixed(1)} KB
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <Upload className="h-10 w-10 text-muted-foreground/50" />
                                <p className="text-muted-foreground">
                                    Click to select a CSV file
                                </p>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    <Button
                        onClick={handleImport}
                        disabled={!file || loading}
                        className="w-full"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Import Domains
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {/* Results */}
            {result && (
                <Card>
                    <CardHeader>
                        <CardTitle>Import Results</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Summary */}
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                <span className="font-medium">{result.success} imported</span>
                            </div>
                            {result.failed > 0 && (
                                <div className="flex items-center gap-2">
                                    <XCircle className="h-5 w-5 text-destructive" />
                                    <span className="font-medium">{result.failed} failed</span>
                                </div>
                            )}
                        </div>

                        {/* Created Domains */}
                        {result.created.length > 0 && (
                            <div>
                                <p className="mb-2 text-sm font-medium">Created:</p>
                                <div className="flex flex-wrap gap-2">
                                    {result.created.slice(0, 20).map((d) => (
                                        <Badge key={d.id} variant="secondary">{d.domain}</Badge>
                                    ))}
                                    {result.created.length > 20 && (
                                        <Badge variant="outline">+{result.created.length - 20} more</Badge>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Errors */}
                        {result.errors.length > 0 && (
                            <div>
                                <p className="mb-2 text-sm font-medium text-destructive">Errors:</p>
                                <div className="max-h-40 overflow-y-auto rounded-md border p-2">
                                    {result.errors.map((err) => (
                                        <div key={`${err.domain}-${err.error}`} className="flex justify-between py-1 text-sm">
                                            <span className="font-mono">{err.domain}</span>
                                            <span className="text-muted-foreground">{err.error}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-2">
                            <Button onClick={() => router.push('/dashboard/domains')}>
                                View All Domains
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
