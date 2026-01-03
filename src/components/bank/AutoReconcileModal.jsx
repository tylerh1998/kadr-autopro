import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { Upload, FileText, CheckCircle2, AlertCircle, ArrowRight, Printer } from 'lucide-react';

export default function AutoReconcileModal({ open, onClose, bankAccountId, onApplyMatches }) {
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
      // 1. Upload File
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      // 2. Process Reconciliation
      const response = await base44.functions.invoke('processBankReconciliation', {
        fileUrl: file_url,
        bankAccountId: bankAccountId
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      setResults(response.data);
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
            .red { color: #dc2626; }
            .green { color: #16a34a; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Reconciliation Report</h1>
          <p>Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
          
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
          </div>

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
                  <td>${row.date}</td>
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
                  <td>${tx.transaction_date}</td>
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
                    <div>${m.csv.date}</div>
                    <div style="color:#666">${m.csv.description}</div>
                  </td>
                  <td class="text-right">
                    ${m.csv.debit > 0 ? `<span class="red">-$${m.csv.debit.toFixed(2)}</span>` : `<span class="green">+$${m.csv.credit.toFixed(2)}</span>`}
                  </td>
                  <td>
                    <div>${m.system.transaction_date}</div>
                    <div style="color:#666">${m.system.description}</div>
                  </td>
                </tr>
              `).join('')}
              ${results.matches.length === 0 ? '<tr><td colspan="3" class="text-center">No matches found</td></tr>' : ''}
            </tbody>
          </table>

          <script>window.print();</script>
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
              <p className="text-sm text-slate-500 text-center max-w-md">
                Ensure your CSV has columns for Date, Description, DebitAmount, and CreditAmount as per the standard export format.
              </p>
              <Button onClick={processFile} disabled={!file || loading}>
                {loading ? "Processing..." : "Upload & Analyze"}
              </Button>
            </div>
          )}

          {step === 'review' && results && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 mb-4">
                 <div className="bg-green-50 p-4 rounded-lg border border-green-100 text-center">
                    <div className="text-2xl font-bold text-green-700">{results.stats.matched}</div>
                    <div className="text-sm text-green-600">Matches Found</div>
                 </div>
                 <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 text-center">
                    <div className="text-2xl font-bold text-orange-700">{results.stats.unmatchedCsv}</div>
                    <div className="text-sm text-orange-600">Unmatched CSV</div>
                 </div>
                 <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-center">
                    <div className="text-2xl font-bold text-blue-700">{results.stats.unmatchedSystem}</div>
                    <div className="text-sm text-blue-600">Unmatched System</div>
                 </div>
              </div>

              <Tabs defaultValue="matched" className="w-full">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="matched">Matched ({results.stats.matched})</TabsTrigger>
                  <TabsTrigger value="unmatched-csv">Unmatched CSV ({results.stats.unmatchedCsv})</TabsTrigger>
                  <TabsTrigger value="unmatched-system">Unmatched System ({results.stats.unmatchedSystem})</TabsTrigger>
                </TabsList>

                <TabsContent value="matched" className="mt-4">
                   <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="p-2 text-left">CSV Date/Desc</th>
                            <th className="p-2 text-right">Amount</th>
                            <th className="p-2 text-center"></th>
                            <th className="p-2 text-left">System Date/Desc</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.matches.map((m, i) => (
                            <tr key={i} className="border-t hover:bg-slate-50">
                               <td className="p-2">
                                  <div className="font-medium">{m.csv.date}</div>
                                  <div className="text-xs text-slate-500 truncate max-w-[200px]" title={m.csv.description}>{m.csv.description}</div>
                               </td>
                               <td className="p-2 text-right font-medium">
                                 {m.csv.debit > 0 ? <span className="text-red-600">-${m.csv.debit.toFixed(2)}</span> : <span className="text-green-600">+${m.csv.credit.toFixed(2)}</span>}
                               </td>
                               <td className="p-2 text-center text-green-500"><ArrowRight className="w-4 h-4 mx-auto"/></td>
                               <td className="p-2">
                                  <div className="font-medium">{m.system.transaction_date}</div>
                                  <div className="text-xs text-slate-500 truncate max-w-[200px]" title={m.system.description}>{m.system.description}</div>
                               </td>
                            </tr>
                          ))}
                          {results.matches.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-500">No matches found.</td></tr>}
                        </tbody>
                      </table>
                   </div>
                </TabsContent>

                <TabsContent value="unmatched-csv" className="mt-4">
                  <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-left">Description</th>
                            <th className="p-2 text-right">Debit</th>
                            <th className="p-2 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.unmatchedCsv.map((row, i) => (
                            <tr key={i} className="border-t hover:bg-slate-50">
                               <td className="p-2">{row.date}</td>
                               <td className="p-2 text-slate-600">{row.description}</td>
                               <td className="p-2 text-right text-red-600">{row.debit > 0 ? formatCurrency(row.debit) : '-'}</td>
                               <td className="p-2 text-right text-green-600">{row.credit > 0 ? formatCurrency(row.credit) : '-'}</td>
                            </tr>
                          ))}
                          {results.unmatchedCsv.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-500">No unmatched CSV transactions.</td></tr>}
                        </tbody>
                      </table>
                   </div>
                   <p className="text-xs text-slate-500 mt-2">These transactions are on the bank statement but could not be matched to an existing record in AutoPRO.</p>
                </TabsContent>

                <TabsContent value="unmatched-system" className="mt-4">
                   <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-left">Description</th>
                            <th className="p-2 text-right">Debit</th>
                            <th className="p-2 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.unmatchedSystem.map((tx, i) => (
                            <tr key={i} className="border-t hover:bg-slate-50">
                               <td className="p-2">{tx.transaction_date}</td>
                               <td className="p-2 text-slate-600">{tx.description}</td>
                               <td className="p-2 text-right text-red-600">{tx.debit_amount > 0 ? formatCurrency(tx.debit_amount) : '-'}</td>
                               <td className="p-2 text-right text-green-600">{tx.credit_amount > 0 ? formatCurrency(tx.credit_amount) : '-'}</td>
                            </tr>
                          ))}
                           {results.unmatchedSystem.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-500">No unmatched system transactions.</td></tr>}
                        </tbody>
                      </table>
                   </div>
                   <p className="text-xs text-slate-500 mt-2">These transactions are in AutoPRO but could not be matched to the uploaded bank statement.</p>
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