import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { Upload, FileText, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

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
                 <Button variant="outline" onClick={onClose}>Close</Button>
                 <Button onClick={handleConfirm} disabled={results.matches.length === 0}>
                   <CheckCircle2 className="w-4 h-4 mr-2" />
                   Confirm & Check Off Matches ({results.matches.length})
                 </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}