import React, { useState, useEffect } from 'react';
import moment from 'moment-timezone';
import { base44 } from '@/api/base44Client';
import { GLTransaction } from '@/entities/all';

const getCurrentMountainTimestamp = () => moment.tz('America/Edmonton').format();
const formatMountainDate = (value) => moment.tz(value, 'America/Edmonton').format('MMM D, YYYY');
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

export default function MarkPaidModal({ open, onClose, transactions = [], onSuccess }) {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      loadBankAccounts();
    }
  }, [open]);

  const loadBankAccounts = async () => {
    try {
      const response = await base44.functions.invoke('SupabaseProxy', {
        action: 'list',
        table: 'BankAccount'
      });

      const accounts = (response.data?.data || []).filter((account) => account.is_active !== false);
      setBankAccounts(accounts);
      setSelectedBankAccount('');
    } catch (err) {
      console.error('Error loading bank accounts:', err);
      setError('Failed to load bank accounts');
    }
  };

  // Calculate net pay dynamically since it's no longer stored
  const getNetPay = (t) => {
    if (t.transaction_type !== 'Paycheque') return t.amount || 0;
    
    const gross = t.gross_pay || 0;
    let deductions = (t.income_tax || 0) + 
                      (t.cpp_contribution || 0) + 
                      (t.cpp2_contribution || 0) + 
                      (t.ei_premium || 0);
                      
    // Handle additional deductions
    if (t.additional_deductions) {
      try {
        const addDeductions = typeof t.additional_deductions === 'string' 
          ? JSON.parse(t.additional_deductions) 
          : t.additional_deductions;
          
        if (Array.isArray(addDeductions)) {
          deductions += addDeductions.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        }
      } catch (e) {
        console.error('Error parsing additional deductions:', e);
      }
    }
    
    return gross - deductions;
  };

  const totalAmount = transactions.reduce((sum, t) => {
    if (t.transaction_type === 'Paycheque') {
      return sum + getNetPay(t);
    } else if (t.transaction_type === 'Remittance') {
      return sum + (t.amount || 0);
    } else if (t.transaction_type === 'Adjustment') {
      return sum + (t.amount || 0);
    }
    return sum;
  }, 0);

  const handleMarkPaid = async () => {
    if (!selectedBankAccount) {
      setError('Please select a bank account');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const selectedAccount = bankAccounts.find(acc => acc.id === selectedBankAccount);

      // Validate GL Balance before processing
      let totalDebits = 0;
      let totalCredits = 0;

      for (const t of transactions) {
        if (t.transaction_type === 'Paycheque') {
          const netPay = getNetPay(t);
          const grossPay = t.gross_pay || 0;
          const incomeTax = t.income_tax || 0;
          const totalCppEmployee = (t.cpp_contribution || 0) + (t.cpp2_contribution || 0);
          const eiPremium = t.ei_premium || 0;
          const totalCppEmployer = (t.cpp_employer || 0) + (t.cpp2_employer || 0);
          const eiEmployer = t.ei_employer || 0;

          // Calculate additional deductions amount
          let additionalDeductionsTotal = 0;
          if (t.additional_deductions) {
            try {
              const addDeductions = typeof t.additional_deductions === 'string' 
                ? JSON.parse(t.additional_deductions) 
                : t.additional_deductions;
              
              if (Array.isArray(addDeductions)) {
                additionalDeductionsTotal = addDeductions.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
              }
            } catch (e) {}
          }

          // Credits (Bank + Liabilities)
          totalCredits += netPay;
          totalCredits += incomeTax;
          totalCredits += totalCppEmployee;
          totalCredits += eiPremium;
          totalCredits += totalCppEmployer;
          totalCredits += eiEmployer;
          totalCredits += additionalDeductionsTotal;

          // Debits (Expenses)
          totalDebits += grossPay;
          totalDebits += totalCppEmployer;
          totalDebits += eiEmployer;
        } else if (t.transaction_type === 'Remittance' || t.transaction_type === 'Adjustment') {
          const amount = Math.abs(t.amount || 0);
          totalDebits += amount;
          totalCredits += amount;
        }
      }

      if (Math.abs(totalDebits - totalCredits) > 0.02) {
        throw new Error(`GL Transactions do not balance. Debits: $${totalDebits.toFixed(2)}, Credits: $${totalCredits.toFixed(2)}`);
      }
      
      const glTransactionsToInsert = [];

      for (const transaction of transactions) {
        // Update transaction as paid
        await base44.functions.invoke('SupabaseProxy', {
          action: 'update',
          table: 'PayrollTransaction',
          id: transaction.id,
          data: {
            is_paid: true
          }
        });

        // Create GL transactions based on transaction type
        const paymentDate = transaction.pay_date;
        const reference = transaction.paycheque_number || 
                         `${transaction.transaction_type}-${format(new Date(paymentDate), 'yyyy-MM-dd')}`;

        // Create Bank Transaction
        if (transaction.transaction_type === 'Paycheque') {
          const netPay = getNetPay(transaction);
          const mountainTimestamp = getCurrentMountainTimestamp();
          await base44.functions.invoke('SupabaseProxy', {
            action: 'create',
            table: 'BankTransaction',
            data: {
              bank_account_id: selectedAccount.id,
              transaction_date: paymentDate,
              description: `Paycheque ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: netPay,
              credit_amount: 0,
              cleared: false,
              source_type: 'payment',
              source_id: transaction.id,
              gl_account: 'Split',
              created_date: mountainTimestamp,
              updated_date: mountainTimestamp
            }
          });
        } else if (transaction.transaction_type === 'Remittance') {
          const mountainTimestamp = getCurrentMountainTimestamp();
          await base44.functions.invoke('SupabaseProxy', {
            action: 'create',
            table: 'BankTransaction',
            data: {
              bank_account_id: selectedAccount.id,
              transaction_date: paymentDate,
              description: `Remittance ${reference}`,
              reference: reference,
              debit_amount: transaction.amount || 0,
              credit_amount: 0,
              cleared: false,
              source_type: 'payment',
              source_id: transaction.id,
              gl_account: '2050',
              created_date: mountainTimestamp,
              updated_date: mountainTimestamp
            }
          });
        } else if (transaction.transaction_type === 'Adjustment') {
          const amount = Math.abs(transaction.amount || 0);
          const isPositive = (transaction.amount || 0) >= 0;
          const postingAccount = String(transaction.gl_account || '5005');
          const mountainTimestamp = getCurrentMountainTimestamp();
          // If positive (cost to company/payment out): Debit BankTransaction (Withdrawal)
          // If negative (refund/money in): Credit BankTransaction (Deposit)
          await base44.functions.invoke('SupabaseProxy', {
            action: 'create',
            table: 'BankTransaction',
            data: {
              bank_account_id: selectedAccount.id,
              transaction_date: paymentDate,
              description: `Payroll Adjustment - ${transaction.adjustment_reason || ''}`,
              reference: reference,
              debit_amount: isPositive ? amount : 0,
              credit_amount: isPositive ? 0 : amount,
              cleared: false,
              source_type: isPositive ? 'payment' : 'deposit',
              source_id: transaction.id,
              gl_account: postingAccount,
              created_date: mountainTimestamp,
              updated_date: mountainTimestamp
            }
          });
        }

        if (transaction.transaction_type === 'Paycheque') {
          const netPay = getNetPay(transaction);

          // Credit Bank Account (payment out)
          glTransactionsToInsert.push({
            account_number: selectedAccount.gl_account || '1000',
            transaction_date: paymentDate,
            description: `Paycheque payment ${transaction.paycheque_number || ''}`,
            reference: reference,
            debit_amount: 0,
            credit_amount: netPay,
            source_type: 'payment',
            source_id: transaction.id
          });

          // Debit Payroll Expense Account
          // 5009 for Bus Driver Wages, 5008 for Regular Wages
          const expenseAccount = transaction.is_bus_driver_wages ? '5009' : '5008';
          const expenseDescription = transaction.is_bus_driver_wages 
            ? `Bus Driver Wages ${transaction.paycheque_number || ''}` 
            : `Wages & Salaries ${transaction.paycheque_number || ''}`;

          glTransactionsToInsert.push({
            account_number: expenseAccount,
            transaction_date: paymentDate,
            description: expenseDescription,
            reference: reference,
            debit_amount: transaction.gross_pay || 0,
            credit_amount: 0,
            source_type: 'payment',
            source_id: transaction.id
          });

          // Credit Income Tax Payable (2054)
          if (transaction.income_tax && transaction.income_tax > 0) {
            glTransactionsToInsert.push({
              account_number: '2054', // Income Tax Payable
              transaction_date: paymentDate,
              description: `Income tax withheld ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: 0,
              credit_amount: transaction.income_tax,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

          // Credit CPP Payable (2052) - Combine CPP and CPP2
          const totalCppEmployee = (transaction.cpp_contribution || 0) + (transaction.cpp2_contribution || 0);
          if (totalCppEmployee > 0) {
            glTransactionsToInsert.push({
              account_number: '2052', // CPP Payable
              transaction_date: paymentDate,
              description: `CPP/CPP2 withheld ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: 0,
              credit_amount: totalCppEmployee,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

          // Credit EI Payable (2053)
          if (transaction.ei_premium && transaction.ei_premium > 0) {
            glTransactionsToInsert.push({
              account_number: '2053', // EI Payable
              transaction_date: paymentDate,
              description: `EI withheld ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: 0,
              credit_amount: transaction.ei_premium,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

          // Credit Additional Deductions (Dynamic GLs)
          if (transaction.additional_deductions) {
            try {
              const addDeductions = typeof transaction.additional_deductions === 'string' 
                ? JSON.parse(transaction.additional_deductions) 
                : transaction.additional_deductions;
                
              if (Array.isArray(addDeductions)) {
                for (const deduction of addDeductions) {
                  if (deduction.amount > 0 && deduction.gl_account) {
                    glTransactionsToInsert.push({
                      account_number: deduction.gl_account,
                      transaction_date: paymentDate,
                      description: `${deduction.description} withheld ${transaction.paycheque_number || ''}`,
                      reference: reference,
                      debit_amount: 0,
                      credit_amount: deduction.amount,
                      source_type: 'payment',
                      source_id: transaction.id
                    });
                  }
                }
              }
            } catch (e) {
              console.error('Error creating GL entries for additional deductions:', e);
            }
          }

          // --- Employer Contributions ---

          // CPP Employer Expense (5006) and Liability (2052)
          const totalCppEmployer = (transaction.cpp_employer || 0) + (transaction.cpp2_employer || 0);
          if (totalCppEmployer > 0) {
            // Debit Expense
            glTransactionsToInsert.push({
              account_number: '5006', // CPP Expense
              transaction_date: paymentDate,
              description: `CPP Employer Expense ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: totalCppEmployer,
              credit_amount: 0,
              source_type: 'payment',
              source_id: transaction.id
            });
            
            // Credit Liability
            glTransactionsToInsert.push({
              account_number: '2052', // CPP Payable
              transaction_date: paymentDate,
              description: `CPP Employer Liability ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: 0,
              credit_amount: totalCppEmployer,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

          // EI Employer Expense (5007) and Liability (2053)
          if (transaction.ei_employer && transaction.ei_employer > 0) {
            // Debit Expense
            glTransactionsToInsert.push({
              account_number: '5007', // EI Expense
              transaction_date: paymentDate,
              description: `EI Employer Expense ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: transaction.ei_employer,
              credit_amount: 0,
              source_type: 'payment',
              source_id: transaction.id
            });
            
            // Credit Liability
            glTransactionsToInsert.push({
              account_number: '2053', // EI Payable
              transaction_date: paymentDate,
              description: `EI Employer Liability ${transaction.paycheque_number || ''}`,
              reference: reference,
              debit_amount: 0,
              credit_amount: transaction.ei_employer,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

        } else if (transaction.transaction_type === 'Remittance') {
          // Credit Bank Account (remittance payment out)
          glTransactionsToInsert.push({
            account_number: selectedAccount.gl_account || '1000',
            transaction_date: paymentDate,
            description: `Remittance payment`,
            reference: reference,
            debit_amount: 0,
            credit_amount: transaction.amount || 0,
            source_type: 'payment',
            source_id: transaction.id
          });

          // Debit Income Tax Payable (2054)
          if (transaction.income_tax && transaction.income_tax > 0) {
            glTransactionsToInsert.push({
              account_number: '2054', // Income Tax Payable
              transaction_date: paymentDate,
              description: `Remittance paid - Income Tax`,
              reference: reference,
              debit_amount: transaction.income_tax,
              credit_amount: 0,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

          // Debit CPP Payable (2052) - Employee + Employer
          const totalCpp = (transaction.cpp_contribution || 0) + (transaction.cpp_employer || 0);
          if (totalCpp > 0) {
            glTransactionsToInsert.push({
              account_number: '2052', // CPP Payable
              transaction_date: paymentDate,
              description: `Remittance paid - CPP`,
              reference: reference,
              debit_amount: totalCpp,
              credit_amount: 0,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

          // Debit EI Payable (2053) - Employee + Employer
          const totalEi = (transaction.ei_premium || 0) + (transaction.ei_employer || 0);
          if (totalEi > 0) {
            glTransactionsToInsert.push({
              account_number: '2053', // EI Payable
              transaction_date: paymentDate,
              description: `Remittance paid - EI`,
              reference: reference,
              debit_amount: totalEi,
              credit_amount: 0,
              source_type: 'payment',
              source_id: transaction.id
            });
          }

        } else if (transaction.transaction_type === 'Adjustment') {
          // Handle adjustments - credit or debit based on positive/negative amount
          const amount = Math.abs(transaction.amount || 0);
          const isPositive = (transaction.amount || 0) >= 0;
          const postingAccount = String(transaction.gl_account || '5005');

          glTransactionsToInsert.push({
            account_number: selectedAccount.gl_account || '1000',
            transaction_date: paymentDate,
            description: `Payroll adjustment - ${transaction.adjustment_reason || ''}`,
            reference: reference,
            debit_amount: isPositive ? 0 : amount,
            credit_amount: isPositive ? amount : 0,
            source_type: 'adjustment',
            source_id: transaction.id
          });

          glTransactionsToInsert.push({
            account_number: postingAccount,
            transaction_date: paymentDate,
            description: `Payroll adjustment - ${transaction.adjustment_reason || ''}`,
            reference: reference,
            debit_amount: isPositive ? amount : 0,
            credit_amount: isPositive ? 0 : amount,
            source_type: 'adjustment',
            source_id: transaction.id
          });
        }
      }

      if (glTransactionsToInsert.length > 0) {
        await base44.functions.invoke('SupabaseProxy', {
          action: 'create',
          table: 'GLTransaction',
          data: glTransactionsToInsert
        });
      }

      // Recalculate bank balance
      await base44.functions.invoke('calculateBankBalances', { bankAccountId: selectedAccount.id });

      onSuccess();
      onClose();
      setSelectedBankAccount('');
    } catch (err) {
      console.error('Error marking transactions as paid:', err);
      setError(err.message || 'Failed to mark transactions as paid');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <DialogTitle>Mark Transactions as Paid</DialogTitle>
              <DialogDescription>
                Record payment for {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">Transactions to mark as paid:</div>
            <ul className="space-y-2">
              {transactions.map((t) => (
                <li key={t.id} className="flex justify-between items-center">
                  <span className="text-sm">
                    {t.transaction_type} - {t.paycheque_number || formatMountainDate(t.pay_date)}
                  </span>
                  <span className="text-sm font-semibold">
                    ${(t.transaction_type === 'Paycheque' ? getNetPay(t) : (t.amount || 0)).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t dark:border-slate-700 mt-3 pt-3 flex justify-between items-center">
              <span className="font-semibold">Total Amount:</span>
              <span className="text-lg font-bold text-green-600 dark:text-green-400">
                ${totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank-account">Payment Account</Label>
            <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
              <SelectTrigger id="bank-account">
                <SelectValue placeholder="Select bank account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} - {account.bank_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded dark:bg-red-900/20 dark:border-red-900/40 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleMarkPaid} disabled={loading || !selectedBankAccount} className="bg-green-600 hover:bg-green-700">
            <DollarSign className="w-4 h-4 mr-2" />
            {loading ? 'Processing...' : 'Mark as Paid'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}