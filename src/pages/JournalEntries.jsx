import React, { useState, useEffect } from 'react';
import { ChartOfAccount, GLTransaction } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Save, RotateCcw, BookOpen, Plus } from 'lucide-react';
import { format } from 'date-fns';

export default function JournalEntriesPage() {
  const accountInputRef = React.useRef(null);
  const [accounts, setAccounts] = useState([]);
  const [transactionDate, setTransactionDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedAccount, setSelectedAccount] = useState('');
  const [currentDebit, setCurrentDebit] = useState('');
  const [currentCredit, setCurrentCredit] = useState('');
  const [currentMemo, setCurrentMemo] = useState('');
  const [journalLines, setJournalLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const accountsData = await ChartOfAccount.filter({ is_active: true }, 'account_number');
      setAccounts(accountsData);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAccountName = (accountNumber) => {
    const account = accounts.find(a => a.account_number === accountNumber);
    return account ? account.account_name : '';
  };

  const totalDebits = journalLines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
  const totalCredits = journalLines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  const handleAddLine = () => {
    if (!selectedAccount || (!currentDebit && !currentCredit)) {
      alert('Please select an account and enter either a debit or credit amount.');
      return;
    }

    const newLine = {
      id: Date.now(),
      account: selectedAccount,
      accountName: getAccountName(selectedAccount),
      debit: currentDebit ? parseFloat(currentDebit).toFixed(2) : '0.00',
      credit: currentCredit ? parseFloat(currentCredit).toFixed(2) : '0.00',
      memo: currentMemo
    };

    setJournalLines([...journalLines, newLine]);
    
    // Clear form
    setSelectedAccount('');
    setCurrentDebit('');
    setCurrentCredit('');
    setCurrentMemo('');

    // Shift focus back to account field
    setTimeout(() => {
      if (accountInputRef.current) {
        accountInputRef.current.focus();
      }
    }, 10);
  };

  const handleDeleteLine = (lineId) => {
    setJournalLines(journalLines.filter(line => line.id !== lineId));
  };

  const handlePost = async () => {
    if (journalLines.length === 0) {
      alert('Please add at least one journal entry line.');
      return;
    }

    if (!isBalanced) {
      alert('Journal entry is not balanced. Total debits must equal total credits.');
      return;
    }

    setSaving(true);
    try {
      // Create GL transactions for each line
      for (const line of journalLines) {
        await GLTransaction.create({
          account_number: line.account,
          transaction_date: transactionDate,
          description: line.memo || 'Manual Journal Entry',
          reference: `JE-${Date.now()}`,
          debit_amount: parseFloat(line.debit) || 0,
          credit_amount: parseFloat(line.credit) || 0,
          source_type: 'manual',
          source_id: null
        });
      }

      alert('Journal entry posted successfully!');
      handleClear();
    } catch (error) {
      console.error('Error posting journal entry:', error);
      alert('Failed to post journal entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setJournalLines([]);
    setSelectedAccount('');
    setCurrentDebit('');
    setCurrentCredit('');
    setCurrentMemo('');
    setTransactionDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleSaveAndNew = async () => {
    await handlePost();
    // Form is already cleared by handlePost
  };

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Make General Journal Entries</h1>
          <p className="text-slate-600 mt-1">Create manual accounting journal entries</p>
        </div>

        {/* Entry Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Journal Entry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Transaction Date */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="transaction-date">Transaction Date:</Label>
                <Input
                  id="transaction-date"
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                />
              </div>
            </div>

            {/* Entry Line Form */}
            <div className="border-t pt-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-3 space-y-2">
                  <Label htmlFor="account">Account</Label>
                  <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger ref={accountInputRef} id="account">
                      <SelectValue placeholder="Select account..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {accounts.map((account) => (
                        <SelectItem key={account.account_number} value={account.account_number}>
                          <span className="font-bold">{account.account_number}</span> - {account.account_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-1 space-y-2">
                  <Label htmlFor="debit">Debit</Label>
                  <Input
                    id="debit"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={currentDebit}
                    onChange={(e) => {
                      setCurrentDebit(e.target.value);
                      if (e.target.value) setCurrentCredit('');
                    }}
                  />
                </div>

                <div className="md:col-span-1 space-y-2">
                  <Label htmlFor="credit">Credit</Label>
                  <Input
                    id="credit"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={currentCredit}
                    onChange={(e) => {
                      setCurrentCredit(e.target.value);
                      if (e.target.value) setCurrentDebit('');
                    }}
                  />
                </div>

                <div className="md:col-span-6 space-y-2">
                  <Label htmlFor="memo">Memo</Label>
                  <Input
                    id="memo"
                    placeholder="Description..."
                    value={currentMemo}
                    onChange={(e) => setCurrentMemo(e.target.value)}
                  />
                </div>

                <div className="md:col-span-1">
                  <Button onClick={handleAddLine} size="sm" className="w-full">
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Journal Lines Grid */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Journal Entry Lines</CardTitle>
            <div className="flex items-center gap-4">
              <Badge variant={isBalanced ? "default" : "destructive"} className="flex items-center gap-1">
                {!isBalanced && <AlertTriangle className="w-3 h-3" />}
                {isBalanced ? 'Balanced' : 'Out of Balance'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700 w-8">#</th>
                    <th className="text-left p-3 font-semibold text-slate-700 w-48">Account</th>
                    <th className="text-right p-3 font-semibold text-slate-700 w-24">Debit</th>
                    <th className="text-right p-3 font-semibold text-slate-700 w-24">Credit</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Memo</th>
                    <th className="text-center p-3 font-semibold text-slate-700 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {journalLines.length > 0 ? (
                    journalLines.map((line, index) => (
                      <tr key={line.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-medium text-slate-600">{index + 1}</td>
                        <td className="p-3">
                          <div>
                            <span className="font-medium">{line.account}</span>
                            <div className="text-xs text-slate-500">{line.accountName}</div>
                          </div>
                        </td>
                        <td className="p-3 text-right font-medium">
                          {parseFloat(line.debit) > 0 ? `$${parseFloat(line.debit).toFixed(2)}` : ''}
                        </td>
                        <td className="p-3 text-right font-medium">
                          {parseFloat(line.credit) > 0 ? `$${parseFloat(line.credit).toFixed(2)}` : ''}
                        </td>
                        <td className="p-3 text-slate-600">{line.memo}</td>
                        <td className="p-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLine(line.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            ×
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="p-12 text-center text-slate-500">
                        No journal entry lines added yet. Use the form above to add entries.
                      </td>
                    </tr>
                  )}
                  {/* Totals Row */}
                  {journalLines.length > 0 && (
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                      <td className="p-3"></td>
                      <td className="p-3">TOTALS:</td>
                      <td className="p-3 text-right text-slate-900">
                        ${totalDebits.toFixed(2)}
                      </td>
                      <td className="p-3 text-right text-slate-900">
                        ${totalCredits.toFixed(2)}
                      </td>
                      <td className="p-3">
                        {!isBalanced && (
                          <span className="text-red-600 text-xs">
                            Difference: ${Math.abs(totalDebits - totalCredits).toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="p-3"></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={handleClear}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Clear
          </Button>
          <Button 
            onClick={handleSaveAndNew}
            disabled={!isBalanced || journalLines.length === 0 || saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Save className="w-4 h-4 mr-2" />
            Save & New
          </Button>
          <Button 
            onClick={handlePost}
            disabled={!isBalanced || journalLines.length === 0 || saving}
            className="bg-green-600 hover:bg-green-700"
          >
            <Save className="w-4 h-4 mr-2" />
            Post Entry
          </Button>
        </div>
      </div>
    </div>
  );
}