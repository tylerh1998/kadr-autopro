import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LinesOfCreditTransaction, LinesOfCredit } from '@/entities/all';
import { Upload, FileText, CheckCircle2, AlertCircle, ArrowRight, Printer, FileCheck } from 'lucide-react';
import { format, parse, isValid, addDays, subDays, differenceInDays } from 'date-fns';

const SERVUS_ID = '68cbcdf3f171308eee277c73';
const ATB_ID = '695c358b0d127adfb929951e';

export default function LOCReconciliationModal({ open, onClose, lineOfCreditId }) {
  const isSupported = [SERVUS_ID, ATB_ID].includes(lineOfCreditId);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('upload'); // 'upload', 'report'
  const [results, setResults] = useState(null);
  const [accountName, setAccountName] = useState('');

  React.useEffect(() => {
    const fetchAccountName = async () => {
      if (lineOfCreditId) {
        try {
          const account = await LinesOfCredit.get(lineOfCreditId);
          if (account) {
            setAccountName(account.name);
          }
        } catch (error) {
          console.error("Failed to fetch account name", error);
        }
      }
    };
    fetchAccountName();
  }, [lineOfCreditId]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const parseCSV = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        try {
          const rows = [];
          const lines = text.split('\n');
          
          // Helper to clean quotes
          const clean = (str) => str ? str.replace(/^"|"$/g, '').trim() : '';

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // SERVUS Parsing
            if (lineOfCreditId === SERVUS_ID) {
                // Skip header if it exists
                if (i === 0 && line.toLowerCase().includes('card number')) continue;

                const parts = line.split(';');
                if (parts.length >= 5) {
                    const dateStr = clean(parts[2]);
                    const desc = clean(parts[3]);
                    const amountStr = clean(parts[4]);

                    // Parse Date: "Jan 5, 2026"
                    const date = new Date(dateStr);
                    
                    // Parse Amount: "$66.58"
                    const amountClean = amountStr.replace(/[$,]/g, '');
                    const amount = parseFloat(amountClean);

                    if (isValid(date) && !isNaN(amount)) {
                        rows.push({
                            date: format(date, 'yyyy-MM-dd'),
                            originalDate: date,
                            description: desc,
                            amount: Math.abs(amount),
                            originalAmount: amount,
                            id: `csv-${i}`
                        });
                    }
                }
            }
            // ATB Parsing
            else if (lineOfCreditId === ATB_ID) {
                // Skip header
                if (i === 0) continue; 
                // Basic CSV split by comma (warning: basic split, won't handle commas in quotes perfectly but sufficient for standard simple CSVs)
                const parts = line.split(','); 
                
                // Indices: 0=Date, 5=Debit, 6=Credit, 7=Extended Text
                if (parts.length >= 8) {
                    const dateStr = clean(parts[0]);
                    const desc = clean(parts[7]);
                    const debitStr = clean(parts[5]);
                    const creditStr = clean(parts[6]);

                    // Parse Date: "1/7/2026" -> M/d/yyyy
                    const date = parse(dateStr, 'M/d/yyyy', new Date());

                    // Determine amount (Debit or Credit)
                    let amount = 0;
                    if (debitStr && parseFloat(debitStr) !== 0) {
                        amount = parseFloat(debitStr); // Charge
                    } else if (creditStr && parseFloat(creditStr) !== 0) {
                        amount = parseFloat(creditStr); // Payment/Credit
                    }

                    if (isValid(date) && !isNaN(amount) && amount !== 0) {
                        rows.push({
                            date: format(date, 'yyyy-MM-dd'),
                            originalDate: date,
                            description: desc,
                            amount: Math.abs(amount),
                            originalAmount: amount,
                            id: `csv-${i}`
                        });
                    }
                }
            }
          }
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  };

  const processFile = async () => {
    if (!file || !lineOfCreditId) return;
    setLoading(true);
    try {
      // 1. Parse CSV Client Side
      const csvRows = await parseCSV(file);
      
      if (csvRows.length === 0) {
        throw new Error("No valid transactions found in CSV");
      }

      // 2. Determine Date Range
      const dates = csvRows.map(r => r.originalDate);
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      
      // Buffer lookback by 30 days, but hard-stop at the CSV's last date
      const queryMin = format(subDays(minDate, 30), 'yyyy-MM-dd');
      const queryMax = format(maxDate, 'yyyy-MM-dd');

      // 3. Fetch System Transactions
      const systemTxs = await LinesOfCreditTransaction.filter({
          line_of_credit_id: lineOfCreditId
      });
      
      // Filter by date range manually since filter might be exact match or limited
      const relevantSystemTxs = systemTxs.filter(tx => 
          tx.transaction_date >= queryMin && 
          tx.transaction_date <= queryMax &&
          tx.source_type !== 'payment_made' // Exclude payment records themselves, focusing on charges
      );

      // 4. Perform Matching
      const matched = [];
      const unmatchedCsv = [];
      let unmatchedSystem = [...relevantSystemTxs];

      // Match logic: Exact Amount, Closest Date
      for (const csvRow of csvRows) {
          // Find candidates with matching amount
          // CSV amount is spending (charge). 
          // System: charge_amount > 0.
          // If CSV amount is negative (refund?), system credit_amount > 0.
          // Assuming CSV positive is charge based on sample.
          
          let candidates = unmatchedSystem.filter(sysTx => {
              const sysAmount = sysTx.charge_amount > 0 ? sysTx.charge_amount : sysTx.credit_amount;
              return Math.abs(sysAmount - csvRow.amount) < 0.01;
          });

          if (candidates.length > 0) {
              // Pick closest date
              candidates.sort((a, b) => {
                  const diffA = Math.abs(differenceInDays(new Date(a.transaction_date), csvRow.originalDate));
                  const diffB = Math.abs(differenceInDays(new Date(b.transaction_date), csvRow.originalDate));
                  return diffA - diffB;
              });

              const bestMatch = candidates[0];
              
              matched.push({
                  csv: csvRow,
                  system: bestMatch
              });

              // Remove from system pool
              unmatchedSystem = unmatchedSystem.filter(tx => tx.id !== bestMatch.id);
          } else {
              unmatchedCsv.push(csvRow);
          }
      }
      
      // Filter out fully paid transactions from unmatched system results
      // Keep if credit_amount > 0 (refunds/credits) or if charge is not fully paid
      unmatchedSystem = unmatchedSystem.filter(tx => {
        if (tx.credit_amount > 0) return true;
        const paid = tx.payment_amount || 0;
        return paid < tx.charge_amount;
      });

      setResults({
          matches: matched,
          unmatchedCsv,
          unmatchedSystem,
          stats: {
              matched: matched.length,
              unmatchedCsv: unmatchedCsv.length,
              unmatchedSystem: unmatchedSystem.length
          },
          dateRange: {
            start: minDate,
            end: maxDate
          }
      });
      setStep('report');

    } catch (error) {
      console.error("Reconciliation failed", error);
      alert("Failed to process file: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintReport = () => {
    if (!results) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to print report.');

    const html = `
      <html>
        <head>
          <title>LOC Reconciliation Report</title>
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
          <h1>Line of Credit Reconciliation Report</h1>
          ${accountName ? `<h2>${accountName}</h2>` : ''}
          <p>
            <strong>Report Date:</strong> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}<br/>
            <strong>Period:</strong> ${results.dateRange ? `${format(results.dateRange.start, 'MMM d, yyyy')} - ${format(results.dateRange.end, 'MMM d, yyyy')}` : 'N/A'}
          </p>
          
          <div class="summary">
            <div class="summary-box green">
              <div class="value">${results.stats.matched}</div>
              <div class="label">Matches</div>
            </div>
            <div class="summary-box orange">
              <div class="value">${results.stats.unmatchedCsv}</div>
              <div class="label">Unmatched Statement</div>
            </div>
            <div class="summary-box blue">
              <div class="value">${results.stats.unmatchedSystem}</div>
              <div class="label">Unmatched System</div>
            </div>
          </div>

          <div class="section-title">Unmatched Statement Transactions</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${results.unmatchedCsv.map(row => `
                <tr>
                  <td>${row.date}</td>
                  <td>${row.description}</td>
                  <td class="text-right">$${row.amount.toFixed(2)}</td>
                </tr>
              `).join('')}
              ${results.unmatchedCsv.length === 0 ? '<tr><td colspan="3" class="text-center">No unmatched statement transactions</td></tr>' : ''}
            </tbody>
          </table>

          <div class="section-title">Unmatched System Transactions</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${results.unmatchedSystem.map(tx => {
                const amt = tx.charge_amount > 0 ? tx.charge_amount : tx.credit_amount;
                return `
                <tr>
                  <td>${tx.transaction_date}</td>
                  <td>${tx.description}</td>
                  <td class="text-right">$${amt.toFixed(2)}</td>
                </tr>
              `}).join('')}
              ${results.unmatchedSystem.length === 0 ? '<tr><td colspan="3" class="text-center">No unmatched system transactions</td></tr>' : ''}
            </tbody>
          </table>

          <div class="section-title">Matched Transactions</div>
          <table>
            <thead>
              <tr>
                <th>CSV Date/Desc</th>
                <th class="text-right">Amount</th>
                <th class="text-center">Match</th>
                <th>System Date/Desc</th>
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
                    $${m.csv.amount.toFixed(2)}
                  </td>
                  <td class="text-center text-green-500">→</td>
                  <td>
                    <div>${m.system.transaction_date}</div>
                    <div style="color:#666">${m.system.description}</div>
                  </td>
                </tr>
              `).join('')}
              ${results.matches.length === 0 ? '<tr><td colspan="4" class="text-center">No matches found</td></tr>' : ''}
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
          <DialogTitle>Line of Credit Reconciliation</DialogTitle>
          <DialogDescription>
             Upload your statement CSV to match transactions against the system.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {!isSupported ? (
             <div className="flex flex-col items-center justify-center h-full py-12 text-slate-500">
               <AlertCircle className="w-12 h-12 mb-4 text-slate-400" />
               <p className="text-lg font-medium text-slate-900">Auto Reconcile Unavailable</p>
               <p className="text-sm">This feature is not supported for this account type.</p>
             </div>
          ) : step === 'upload' ? (
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <div className="w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="csv-upload">Statement CSV</Label>
                <Input id="csv-upload" type="file" accept=".csv" onChange={handleFileChange} />
              </div>
              <p className="text-sm text-slate-500 text-center max-w-md">
                {lineOfCreditId === SERVUS_ID 
                  ? "Servus Format: Semicolon delimited (Date; Description; Amount)" 
                  : "ATB Format: Comma delimited (Date, Debit, Credit, Text)"}
              </p>
              <Button onClick={processFile} disabled={!file || loading} className="bg-purple-600 hover:bg-purple-700">
                {loading ? "Processing..." : "Analyze Statement"}
              </Button>
            </div>
          ) : step === 'report' && results ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 mb-4">
                 <div className="bg-green-50 p-4 rounded-lg border border-green-100 text-center">
                    <div className="text-2xl font-bold text-green-700">{results.stats.matched}</div>
                    <div className="text-sm text-green-600">Matches Found</div>
                 </div>
                 <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 text-center">
                    <div className="text-2xl font-bold text-orange-700">{results.stats.unmatchedCsv}</div>
                    <div className="text-sm text-orange-600">Unmatched Statement</div>
                 </div>
                 <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-center">
                    <div className="text-2xl font-bold text-blue-700">{results.stats.unmatchedSystem}</div>
                    <div className="text-sm text-blue-600">Unmatched System</div>
                 </div>
              </div>

              <Tabs defaultValue="matched" className="w-full">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="matched">Matched ({results.stats.matched})</TabsTrigger>
                  <TabsTrigger value="unmatched-csv">Unmatched Statement ({results.stats.unmatchedCsv})</TabsTrigger>
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
                                 ${m.csv.amount.toFixed(2)}
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
                            <th className="p-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.unmatchedCsv.map((row, i) => (
                            <tr key={i} className="border-t hover:bg-slate-50">
                               <td className="p-2">{row.date}</td>
                               <td className="p-2 text-slate-600">{row.description}</td>
                               <td className="p-2 text-right">${row.amount.toFixed(2)}</td>
                            </tr>
                          ))}
                          {results.unmatchedCsv.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-slate-500">No unmatched statement transactions.</td></tr>}
                        </tbody>
                      </table>
                   </div>
                </TabsContent>

                <TabsContent value="unmatched-system" className="mt-4">
                   <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-left">Description</th>
                            <th className="p-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.unmatchedSystem.map((tx, i) => {
                             const amt = tx.charge_amount > 0 ? tx.charge_amount : tx.credit_amount;
                             return (
                            <tr key={i} className="border-t hover:bg-slate-50">
                               <td className="p-2">{tx.transaction_date}</td>
                               <td className="p-2 text-slate-600">{tx.description}</td>
                               <td className="p-2 text-right">${amt.toFixed(2)}</td>
                            </tr>
                          )})}
                           {results.unmatchedSystem.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-slate-500">No unmatched system transactions.</td></tr>}
                        </tbody>
                      </table>
                   </div>
                   <p className="text-xs text-slate-500 mt-2">Showing system transactions within 30 days of the CSV date range.</p>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {!isSupported ? (
            <Button variant="outline" onClick={onClose}>Close</Button>
        ) : step === 'upload' ? (
             <Button variant="outline" onClick={onClose}>Cancel</Button>
          ) : (
            <div className="flex justify-between w-full">
              <Button variant="outline" onClick={() => setStep('upload')}>Back to Upload</Button>
              <div className="flex gap-2">
                 <Button variant="outline" onClick={handlePrintReport}>
                    <Printer className="w-4 h-4 mr-2" />
                    Print Report
                 </Button>
                 <Button onClick={onClose} className="bg-purple-600 hover:bg-purple-700">
                   Close Reconciliation
                 </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}