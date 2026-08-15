import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, FileText, X, ClipboardPaste } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function WOPartsImportModal({ open, onClose, onSuccess, suppliers = [] }) {
    const [supplierId, setSupplierId] = useState('');
    const [files, setFiles] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    const resetAndClose = () => {
        if (processing) return;
        setSupplierId('');
        setFiles([]);
        setError(null);
        setProgress(null);
        onClose();
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(prev => [...prev, ...Array.from(e.target.files)]);
            setError(null);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleRemoveFile = (indexToRemove) => {
        setFiles(files.filter((_, index) => index !== indexToRemove));
    };

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const pastedImages = [];
        for (const item of items) {
            if (item.type && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    const ext = item.type.split('/')[1] || 'png';
                    pastedImages.push(new File([file], `pasted-${Date.now()}.${ext}`, { type: item.type }));
                }
            }
        }

        if (pastedImages.length > 0) {
            e.preventDefault();
            setFiles(prev => [...prev, ...pastedImages]);
            setError(null);
        }
    };

    const handleProcess = async () => {
        if (!supplierId) {
            setError('Select a supplier before processing.');
            return;
        }
        if (files.length === 0) return;

        setProcessing(true);
        setError(null);
        setProgress(`Processing 0 of ${files.length} file(s)...`);
        const combinedItems = [];

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setProgress(`Processing file ${i + 1} of ${files.length}: ${file.name}...`);

                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                const storagePath = `temp/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('kadr-digital_invoice_uploads')
                    .upload(storagePath, file);

                if (uploadError) {
                    throw new Error(`Failed to upload ${file.name} to storage: ${uploadError.message}`);
                }

                // Raw fetch (not supabase.functions.invoke) to avoid potential cache/proxy issues, matching PartsInvoiceOCRModal
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                const url = `${supabaseUrl}/functions/v1/autopro-processPartsInvoiceOCR?t=${Date.now()}`;

                const match = document.cookie.match(/(?:^|;\s*)supabase_auth_token=([^;]+)/);
                let jwtToken = supabaseAnonKey;
                if (match) {
                    try {
                        let rawValue = match[1];
                        if (rawValue.startsWith('%7B')) rawValue = decodeURIComponent(rawValue);
                        const sessionData = JSON.parse(rawValue);
                        jwtToken = Array.isArray(sessionData) ? sessionData[0]?.access_token : sessionData?.access_token;
                    } catch (e) {}
                }

                const fetchResponse = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${jwtToken}`
                    },
                    body: JSON.stringify({
                        storagePath,
                        mimeType: file.type || 'application/pdf',
                        documentContext: 'wo_parts'
                    })
                });

                if (!fetchResponse.ok) {
                    let errorMsg = `Server returned status ${fetchResponse.status}`;
                    try {
                        const errorData = await fetchResponse.json();
                        if (errorData.error) errorMsg += `: ${errorData.error}`;
                    } catch (e) {}
                    throw new Error(errorMsg);
                }

                const responseData = await fetchResponse.json();
                if (!responseData || !responseData.success) {
                    throw new Error(responseData?.error || `Failed to process ${file.name}`);
                }

                const invoices = responseData.data?.invoices || [];
                if (invoices.length === 0 && responseData.data?.items) {
                    invoices.push(responseData.data);
                }

                invoices.forEach(inv => {
                    (inv.items || []).forEach(item => combinedItems.push(item));
                });
            }

            setProgress('Done!');
            setTimeout(() => {
                onSuccess({ supplierId, items: combinedItems });
                setFiles([]);
                setSupplierId('');
                setProcessing(false);
                setProgress(null);
                onClose();
            }, 500);

        } catch (err) {
            console.error('WO Parts Import OCR Error:', err);
            setError(err.message || 'An error occurred while processing the file(s).');
            setProcessing(false);
            setProgress(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) resetAndClose(); }}>
            <DialogContent className="sm:max-w-md dark:bg-slate-950 dark:border-slate-800">
                <DialogHeader>
                    <DialogTitle>Paste / Upload Parts</DialogTitle>
                    <DialogDescription>
                        Paste a screenshot, or upload a PDF/image of a parts cart or order confirmation. Extracted parts get added to the batch below.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="wo-parts-supplier">Supplier *</Label>
                        <Select value={supplierId} onValueChange={setSupplierId} disabled={processing}>
                            <SelectTrigger id="wo-parts-supplier">
                                <SelectValue placeholder="Select supplier for this import" />
                            </SelectTrigger>
                            <SelectContent>
                                {[...suppliers]
                                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                    .map(s => (
                                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Applied to every part imported in this session.</p>
                    </div>

                    {!processing && (
                        <div
                            onPaste={handlePaste}
                            tabIndex={0}
                            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-md p-4 text-center text-sm text-slate-500 dark:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-text"
                        >
                            <ClipboardPaste className="w-5 h-5 mx-auto mb-1" />
                            Click here and press Ctrl+V to paste a screenshot
                        </div>
                    )}

                    {!processing && (
                        <div className="grid w-full items-center gap-1.5">
                            <Label htmlFor="wo-parts-files">Or upload PDF / Image</Label>
                            <Input
                                id="wo-parts-files"
                                type="file"
                                accept="application/pdf,image/png,image/jpeg"
                                multiple
                                onChange={handleFileChange}
                                ref={fileInputRef}
                                className="cursor-pointer"
                            />
                        </div>
                    )}

                    {files.length > 0 && (
                        <div className="border rounded-md p-3 bg-slate-50 dark:bg-slate-900 dark:border-slate-800 max-h-40 overflow-y-auto">
                            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-2 block">Selected Files ({files.length})</Label>
                            <div className="space-y-2">
                                {files.map((file, i) => (
                                    <div key={i} className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 border dark:border-slate-700 rounded text-sm">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                                            <span className="truncate max-w-[220px]" title={file.name}>{file.name}</span>
                                        </div>
                                        {!processing && (
                                            <button
                                                onClick={() => handleRemoveFile(i)}
                                                className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {processing && (
                        <div className="flex flex-col items-center justify-center py-6 space-y-4">
                            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center animate-pulse">
                                {progress || 'Processing...'}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm rounded-md">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter className="sm:justify-between">
                    <Button type="button" variant="outline" onClick={resetAndClose} disabled={processing} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100">
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleProcess}
                        disabled={files.length === 0 || processing || !supplierId}
                        className="bg-black hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                    >
                        {processing ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4 mr-2" />
                                Process {files.length} File{files.length !== 1 ? 's' : ''}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
