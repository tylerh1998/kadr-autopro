import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import { Upload, FileText, CheckCircle2, AlertCircle, AlertTriangle, ArrowRight, Printer } from 'lucide-react';

// Dates coming back from the backend can be plain CSV strings (e.g. "01/15/2026") or full
// ISO timestamps from the BankTransaction table (e.g. "2026-01-15T00:00:00.000Z") — strip
// any time component so the review tables only ever show a date.
const formatDateOnly = (value) => {
  if (!value) return '—';
  const str = String(value).trim();
  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    try {
      const parsed = parseISO(isoMatch[1]);
      if (!isNaN(parsed.getTime())) return format(parsed, 'MMM d, yyyy');
    } catch {}
    return isoMatch[1];
  }
  return str.split(' ')[0];
};

export default function AutoReconcileModal({ open, onClose, bankAccountId, periodEnd, onApplyMatches }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('upload'); // 'upload', 'review'
  const [results, setResults] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const processFile = async () => {
    if (!file) return;
    setLoading(true);
    try {
      // 1. Upload File to Supabase Storage (private bucket), then get a short-lived signed URL
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `bank-reconciliation/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('kadr-digital_invoice_uploads')
        .upload(storagePath, file);

      if (uploadError) {
        throw new Error(`Failed to upload file: ${uploadError.message}`);
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('kadr-digital_invoice_uploads')
        .createSignedUrl(storagePath, 60);

      if (signedUrlError) {
        throw new Error(`Failed to generate file URL: ${signedUrlError.message}`);
      }

      const file_url = signedUrlData.signedUrl;

      // 2. Process Reconciliation
      const { data, error: invokeError } = await supabase.functions.invoke('autopro-processBankReconciliation', {
        body: {
          fileUrl: file_url,
          bankAccountId: bankAccountId,
          periodEnd
        }
      });

      if (invokeError) {
        throw new Error(invokeError.message);
      }
      if (data.error) {
        throw new Error(data.error);
      }

      setResults(data);
      setStep('review');
    } catch (error) {
      console.error("Reconciliation failed", error);
      alert("Failed to process file: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (results && results.matches) {
      const matchedIds = results.matches.map(m => m.system.id);
      onApplyMatches(matchedIds);
      onClose();
    }
  };

  const formatCurrency = (val) => {
    const num = parseFloat(val);
    return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`;
  };

  const handlePrintReport = () => {
    if (!results) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to print report.');

    const html = `
      <html>
        <head>
          <title>Reconciliation Report</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h1 { margin-bottom: 5px; }
            .summary { display: flex; gap: 20px; margin-bottom: 30px; }
            .summary-box { border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; min-width: 120px; }
            .summary-box.green { background-color: #f0fdf4; border-color: #bbf7d0; color: #166534; }
            .summary-box.orange { background-color: #fff7ed; border-color: #fed7aa; color: #9a3412; }
            .summary-box.blue { background-color: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
            .value { font-size: 24px; font-weight: bold; }
            .label { font-size: 12px; opacity: 0.8; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f8f9fa; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #eee; padding-bottom: 5px; }
            .section-title.error-title { color: #b91c1c; border-bottom-color: #b91c1c; }
            .error-table th { background-color: #fee2e2 !important; }
            .reason-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background-color: #fee2e2; color: #991b1b; font-size: 11px; font-weight: bold; }
            .red { color: #dc2626; }
            .green { color: #16a34a; }
            .summary-box.red { background-color: #fef2f2; border-color: #fecaca; color: #991b1b; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Reconciliation Report</h1>
          <p>Date: ${new Date().toLocaleDateString()}</p>

          <div class="summary">
            <div class="summary-box green">
              <div class="value">${results.stats.matched}</div>
              <div class="label">Matches</div>
            </div>
            <div class="summary-box orange">
              <div class="value">${results.stats.unmatchedCsv}</div>
              <div class="label">Unmatched CSV</div>
            </div>
            <div class="summary-box blue">
              <div class="value">${results.stats.unmatchedSystem}</div>
              <div class="label">Unmatched System</div>
            </div>
            <div class="summary-box red">
              <div class="value">${(results.errors || []).length}</div>
              <div class="label">Needs Review</div>
            </div>
          </div>

          ${(results.errors || []).length > 0 ? `
          <div class="section-title error-title">Needs Review — Amount Mismatch</div>
          <table class="error-table">
            <thead>
              <tr>
                <th>Reason</th>
                <th>CSV Date</th>
                <th>CSV Desc</th>
                <th class="text-right">CSV Amount</th>
                <th>System Date</th>
                <th>System Desc</th>
                <th class="text-right">System Amount</th>
                <th class="text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              ${results.errors.map(err => {
                const csvAmount = err.csv.debit > 0 ? err.csv.debit : err.csv.credit;
                const sysAmount = err.csv.debit > 0 ? err.system.debit_amount : err.system.credit_amount;
                return `
                <tr>
                  <td><span class="reason-badge">${err.reason}</span></td>
                  <td>${formatDateOnly(err.csv.date)}</td>
                  <td>${err.csv.description}</td>
                  <td class="text-right">$${csvAmount.toFixed(2)}</td>
                  <td>${formatDateOnly(err.system.transaction_date)}</td>
                  <td>${err.system.description}</td>
                  <td class="text-right">$${sysAmount.toFixed(2)}</td>
                  <td class="text-right">$${Math.abs(err.difference).toFixed(2)}</td>
                </tr>
              `;}).join('')}
            </tbody>
          </table>
          ` : ''}

          <div class="section-title">Unmatched CSV Transactions</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th class="text-right">Debit</th>
                <th class="text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              ${results.unmatchedCsv.map(row => `
                <tr>
                  <td>${formatDateOnly(row.date)}</td>
                  <td>${row.description}</td>
                  <td class="text-right ${row.debit > 0 ? 'red' : ''}">${row.debit > 0 ? '$'+row.debit.toFixed(2) : '-'}</td>
                  <td class="text-right ${row.credit > 0 ? 'green' : ''}">${row.credit > 0 ? '$'+row.credit.toFixed(2) : '-'}</td>
                </tr>
              `).join('')}
              ${results.unmatchedCsv.length === 0 ? '<tr><td colspan="4" class="text-center">No unmatched CSV transactions</td></tr>' : ''}
            </tbody>
          </table>

          <div class="section-title">Unmatched System Transactions</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th class="text-right">Debit</th>
                <th class="text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              ${results.unmatchedSystem.map(tx => `
                <tr>
                  <td>${formatDateOnly(tx.transaction_date)}</td>
                  <td>${tx.description}</td>
                  <td class="text-right ${tx.debit_amount > 0 ? 'red' : ''}">${tx.debit_amount > 0 ? '$'+tx.debit_amount.toFixed(2) : '-'}</td>
                  <td class="text-right ${tx.credit_amount > 0 ? 'green' : ''}">${tx.credit_amount > 0 ? '$'+tx.credit_amount.toFixed(2) : '-'}</td>
                </tr>
              `).join('')}
              ${results.unmatchedSystem.length === 0 ? '<tr><td colspan="4" class="text-center">No unmatched system transactions</td></tr>' : ''}
            </tbody>
          </table>

          <div class="section-title">Matched Transactions</div>
          <table>
            <thead>
              <tr>
                <th>CSV Date/Desc</th>
                <th class="text-right">Amount</th>
                <th class="text-center">System Date/Desc</th>
              </tr>
            </thead>
            <tbody>
              ${results.matches.map(m => `
                <tr>
                  <td>
                    <div>${formatDateOnly(m.csv.date)}</div>
                    <div style="color:#666">${m.csv.description}</div>
                  </td>
                  <td class="text-right">
                    ${m.csv.debit > 0 ? `<span class="red">-$${m.csv.debit.toFixed(2)}</span>` : `<span class="green">+$${m.csv.credit.toFixed(2)}</span>`}
                  </td>
                  <td>
                    <div>${formatDateOnly(m.system.transaction_date)}</div>
                    <div style="color:#666">${m.system.description}</div>
                  </td>
                </tr>
              `).join('')}
              ${results.matches.length === 0 ? '<tr><td colspan="3" class="text-center">No matches found</td></tr>' : ''}
            </tbody>
          </table>

          <script>
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Automated Bank Reconciliation</DialogTitle>
          <DialogDescription>
             Upload your bank statement CSV to automatically match transactions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <div className="w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="csv-upload">Bank Statement CSV</Label>
                <Input id="csv-upload" type="file" accept=".csv" onChange={handleFileChange} />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md">
                Ensure your CSV has columns for Date, Description, DebitAmount, and CreditAmount as per the standard export format.
              </p>
              <Button onClick={processFile} disabled={!file || loading}>
                {loading ? "Processing..." : "Upload & Analyze"}
              </Button>
            </div>
          )}

          {step === 'review' && results && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4 mb-4">
                 <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg border border-green-100 dark:border-green-800 text-center">
                    <div className="text-2xl font-bold text-green-700 dark:text-green-400">{results.stats.matched}</div>
                    <div className="text-sm text-green-600 dark:text-green-400">Matches Found</div>
                 </div>
                 <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-lg border border-red-100 dark:border-red-800 text-center">
                    <div className="text-2xl font-bold text-red-700 dark:text-red-400">{results.stats.errors || 0}</div>
                    <div className="text-sm text-red-600 dark:text-red-400">Needs Review</div>
                 </div>
                 <div className="bg-orange-50 dark:bg-orange-950/30 p-4 rounded-lg border border-orange-100 dark:border-orange-800 text-center">
                    <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{results.stats.unmatchedCsv}</div>
                    <div className="text-sm text-orange-600 dark:text-orange-400">Unmatched CSV</div>
                 </div>
                 <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-100 dark:border-blue-800 text-center">
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{results.stats.unmatchedSystem}</div>
                    <div className="text-sm text-blue-600 dark:text-blue-400">Unmatched System</div>
                 </div>
              </div>

              <Tabs defaultValue="matched" className="w-full">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="matched">Matched ({results.stats.matched})</TabsTrigger>
                  <TabsTrigger value="errors">Needs Review ({results.stats.errors || 0})</TabsTrigger>
                  <TabsTrigger value="unmatched-csv">Unmatched CSV ({results.stats.unmatchedCsv})</TabsTrigger>
                  <TabsTrigger value="unmatched-system">Unmatched System ({results.stats.unmatchedSystem})</TabsTrigger>
                </TabsList>

                <TabsContent value="matched" className="mt-4">
                   <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="p-2 text-left">CSV Date/Desc</th>
                            <th className="p-2 text-right">Amount</th>
                            <th className="p-2 text-center"></th>
                            <th className="p-2 text-left">System Date/Desc</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.matches.map((m, i) => (
                            <tr key={i} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800/60">
                               <td className="p-2">
                                  <div className="font-medium">{formatDateOnly(m.csv.date)}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]" title={m.csv.description}>{m.csv.description}</div>
                               </td>
                               <td className="p-2 text-right font-medium">
                                 {m.csv.debit > 0 ? <span className="text-red-600 dark:text-red-400">-${m.csv.debit.toFixed(2)}</span> : <span className="text-green-600 dark:text-green-400">+${m.csv.credit.toFixed(2)}</span>}
                               </td>
                               <td className="p-2 text-center text-green-500 dark:text-green-400"><ArrowRight className="w-4 h-4 mx-auto"/></td>
                               <td className="p-2">
                                  <div className="font-medium">{formatDateOnly(m.system.transaction_date)}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]" title={m.system.description}>{m.system.description}</div>
                               </td>
                            </tr>
                          ))}
                          {results.matches.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-500 dark:text-slate-400">No matches found.</td></tr>}
                        </tbody>
                      </table>
                   </div>
                </TabsContent>

                <TabsContent value="errors" className="mt-4">
                   {(results.errors || []).length > 0 ? (
                     <div className="border border-red-200 dark:border-red-900 rounded-md overflow-hidden">
                        <div className="bg-red-600 text-white px-3 py-2 flex items-center justify-between">
                           <span className="font-semibold flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              Possible Matches — Amount Mismatch
                           </span>
                           <span className="font-semibold text-sm">
                              Total Discrepancy: {formatCurrency(results.errors.reduce((sum, err) => sum + Math.abs(err.difference || 0), 0))}
                           </span>
                        </div>
                        <table className="w-full text-sm">
                          <thead className="bg-red-50 dark:bg-red-950/30">
                            <tr>
                              <th className="p-2 text-left">Reason</th>
                              <th className="p-2 text-left">CSV Date/Desc</th>
                              <th className="p-2 text-right">CSV Amount</th>
                              <th className="p-2 text-left">System Date/Desc</th>
                              <th className="p-2 text-right">System Amount</th>
                              <th className="p-2 text-right">Difference</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.errors.map((err, i) => (
                              <tr key={i} className="border-t border-red-100 dark:border-red-900 hover:bg-red-50/50 dark:hover:bg-red-950/20">
                                 <td className="p-2">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                                       {err.reason}
                                    </span>
                                 </td>
                                 <td className="p-2">
                                    <div className="font-medium">{formatDateOnly(err.csv.date)}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]" title={err.csv.description}>{err.csv.description}</div>
                                 </td>
                                 <td className="p-2 text-right font-medium">
                                   {err.csv.debit > 0 ? <span className="text-red-600 dark:text-red-400">-${err.csv.debit.toFixed(2)}</span> : <span className="text-green-600 dark:text-green-400">+${err.csv.credit.toFixed(2)}</span>}
                                 </td>
                                 <td className="p-2">
                                    <div className="font-medium">{formatDateOnly(err.system.transaction_date)}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]" title={err.system.description}>{err.system.description}</div>
                                 </td>
                                 <td className="p-2 text-right font-medium">
                                   {err.csv.debit > 0 ? <span className="text-red-600 dark:text-red-400">-${(err.system.debit_amount || 0).toFixed(2)}</span> : <span className="text-green-600 dark:text-green-400">+${(err.system.credit_amount || 0).toFixed(2)}</span>}
                                 </td>
                                 <td className="p-2 text-right font-semibold text-red-700 dark:text-red-400">{formatCurrency(Math.abs(err.difference || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                     </div>
                   ) : (
                     <p className="text-center text-slate-500 dark:text-slate-400 py-8">No amount discrepancies found.</p>
                   )}
                   <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">These look like the same transaction, but the amount doesn't quite match (digit transposition, decimal shift, or a close amount) — review before reconciling manually.</p>
                </TabsContent>

                <TabsContent value="unmatched-csv" className="mt-4">
                  <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-left">Description</th>
                            <th className="p-2 text-right">Debit</th>
                            <th className="p-2 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.unmatchedCsv.map((row, i) => (
                            <tr key={i} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800/60">
                               <td className="p-2">{formatDateOnly(row.date)}</td>
                               <td className="p-2 text-slate-600 dark:text-slate-400">{row.description}</td>
                               <td className="p-2 text-right text-red-600 dark:text-red-400">{row.debit > 0 ? formatCurrency(row.debit) : '-'}</td>
                               <td className="p-2 text-right text-green-600 dark:text-green-400">{row.credit > 0 ? formatCurrency(row.credit) : '-'}</td>
                            </tr>
                          ))}
                          {results.unmatchedCsv.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-500 dark:text-slate-400">No unmatched CSV transactions.</td></tr>}
                        </tbody>
                      </table>
                   </div>
                   <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">These transactions are on the bank statement but could not be matched to an existing record in AutoPRO.</p>
                </TabsContent>

                <TabsContent value="unmatched-system" className="mt-4">
                   <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-left">Description</th>
                            <th className="p-2 text-right">Debit</th>
                            <th className="p-2 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.unmatchedSystem.map((tx, i) => (
                            <tr key={i} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800/60">
                               <td className="p-2">{formatDateOnly(tx.transaction_date)}</td>
                               <td className="p-2 text-slate-600 dark:text-slate-400">{tx.description}</td>
                               <td className="p-2 text-right text-red-600 dark:text-red-400">{tx.debit_amount > 0 ? formatCurrency(tx.debit_amount) : '-'}</td>
                               <td className="p-2 text-right text-green-600 dark:text-green-400">{tx.credit_amount > 0 ? formatCurrency(tx.credit_amount) : '-'}</td>
                            </tr>
                          ))}
                           {results.unmatchedSystem.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-500 dark:text-slate-400">No unmatched system transactions.</td></tr>}
                        </tbody>
                      </table>
                   </div>
                   <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">These transactions are in AutoPRO but could not be matched to the uploaded bank statement.</p>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'upload' ? (
             <Button variant="outline" onClick={onClose}>Cancel</Button>
          ) : (
            <div className="flex justify-between w-full">
              <Button variant="outline" onClick={() => setStep('upload')}>Back to Upload</Button>
              <div className="flex gap-2">
                 <Button variant="outline" onClick={handlePrintReport}>
                    <Printer className="w-4 h-4 mr-2" />
                    Print Report
                 </Button>
                 <Button variant="outline" onClick={onClose}>Close</Button>
                 <Button onClick={handleConfirm} disabled={results.matches.length === 0}>
                   <CheckCircle2 className="w-4 h-4 mr-2" />
                   Confirm Matches ({results.matches.length})
                 </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}