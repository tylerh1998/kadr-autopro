import React, { useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, X, ScanLine } from 'lucide-react';

export default function StatementUploadCard({ file, onFileSelect, onClear, onSubmit, processing, progress, error }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  const handleClear = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClear();
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-[280px]">
            <Label htmlFor="statement-file" className="whitespace-nowrap font-semibold text-slate-700 dark:text-slate-300">Upload Statement</Label>
            {!file ? (
              <Input
                id="statement-file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={handleFileChange}
                ref={fileInputRef}
                disabled={processing}
                className="cursor-pointer max-w-md"
              />
            ) : (
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded px-3 py-2 text-sm max-w-md">
                <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="truncate" title={file.name}>{file.name}</span>
                {!processing && (
                  <button onClick={handleClear} className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors ml-1">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
          <Button
            onClick={onSubmit}
            disabled={!file || processing}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {progress || 'Reconciling...'}
              </>
            ) : (
              <>
                <ScanLine className="w-4 h-4 mr-2" />
                Reconcile
              </>
            )}
          </Button>
        </div>
        {error && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm rounded-md">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
