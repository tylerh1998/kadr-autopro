import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Printer, Mail, Copy } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { Statement } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import StatementEmailModal from './StatementEmailModal';

export default function StatementModal({ open, onClose, customer }) {
  const [transactions, setTransactions] = useState([]);
  const [agedBalances, setAgedBalances] = useState({ current: 0, '30': 0, '60': 0, '90+': 0, total: 0 });
  const [statementPortalId, setStatementPortalId] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);

  useEffect(() => {
    const createStatementRecord = async () => {
      if (open && customer) {
        try {
          // 1. Fetch all transactions using backend function (no date filters for statement)
          const transactionsResponse = await base44.functions.invoke('getCustomerARTransactions', {
            customerId: customer.id,
            dateFrom: null,
            dateTo: null,
            searchTerm: ''
          });

          if (!transactionsResponse.data.success) {
            console.error('Failed to load transactions:', transactionsResponse.data.error);
            return;
          }

          // Combine both tabs for complete transaction list
          const allTransactions = [
            ...transactionsResponse.data.transactionsTab,
            ...transactionsResponse.data.paymentsTab
          ];
          setTransactions(allTransactions);

          // 2. Extract additional data needed for aging calculations from the backend response
          const allCustomerPayments = transactionsResponse.data.allPayments || [];
          const customerAdj = transactionsResponse.data.allAdjustments || [];

          // 3. Calculate aged balances using logic from AR Summary
          const today = new Date();
          const onAccountCharges = allCustomerPayments.filter(p => p.payment_method === 'on_account');
          const actualPayments = allCustomerPayments.filter(p => p.ar_pmt && p.payment_method !== 'on_account');
          const totalActualPayments = actualPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
          const totalCreditAdjustments = customerAdj.reduce((sum, adj) => sum + (adj.amount < 0 ? Math.abs(adj.amount) : 0), 0);
          const totalCredits = totalActualPayments + totalCreditAdjustments;
          
          let chargeItems = [];
          onAccountCharges.forEach(charge => charge.payment_date && chargeItems.push({ date: new Date(charge.payment_date), daysOld: differenceInDays(today, new Date(charge.payment_date)), amount: charge.amount || 0 }));
          customerAdj.forEach(adj => adj.amount > 0 && adj.adjustment_date && chargeItems.push({ date: new Date(adj.adjustment_date), daysOld: differenceInDays(today, new Date(adj.adjustment_date)), amount: adj.amount }));
          
          // Sort charges by date to apply credits chronologically
          chargeItems.sort((a, b) => a.date.getTime() - b.date.getTime());

          let tempCreditsToApply = totalCredits;
          chargeItems.forEach(charge => {
              if (tempCreditsToApply > 0) {
                  const paidAmount = Math.min(tempCreditsToApply, charge.amount);
                  charge.amount -= paidAmount;
                  tempCreditsToApply -= paidAmount;
              }
          });
          
          const calculatedAgedBalances = chargeItems.reduce((acc, item) => {
              if (item.amount > 0) {
                  if (item.daysOld <= 30) acc.current += item.amount;
                  else if (item.daysOld <= 60) acc['30'] += item.amount;
                  else if (item.daysOld <= 90) acc['60'] += item.amount;
                  else acc['90+'] += item.amount;
              }
              return acc;
          }, { current: 0, '30': 0, '60': 0, '90+': 0, total: 0 });
          calculatedAgedBalances.total = calculatedAgedBalances.current + calculatedAgedBalances['30'] + calculatedAgedBalances['60'] + calculatedAgedBalances['90+'];
          setAgedBalances(calculatedAgedBalances);

          // 4. Keep the backend-enriched transaction data and filter out fully paid items
          const enrichedTransactions = allTransactions.filter(t => {
            const roundedBalance = Math.round((t.balance || 0) * 100) / 100;
            return Math.abs(roundedBalance) > 0;
          });

          // 5. Create the Statement record
          const generateRandomString = (length) => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
              result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
          };

          const newStatement = {
            cp_id: generateRandomString(10),
            customer_id: customer.id,
            statement_date: format(new Date(), 'yyyy-MM-dd'),
            transactions: JSON.stringify(enrichedTransactions),
            aged_balances: JSON.stringify(calculatedAgedBalances),
            total_balance_due: calculatedAgedBalances.total,
          };
          
          await Statement.create(newStatement);
          setStatementPortalId(newStatement.cp_id);
          console.log("Statement record created successfully:", newStatement);

        } catch (error) {
          console.error("Failed to create statement record:", error);
        }
      }
    };
    
    if (open && customer) {
      createStatementRecord();
    }
  }, [open, customer]);
  
  const handlePrint = () => {
    const printContents = document.getElementById('statement-print-area').innerHTML;
    const originalContents = document.body.innerHTML;
    document.body.innerHTML = printContents;
    window.print();
    document.body.innerHTML = originalContents;
    window.location.reload();
  };

  const handleCopyUrl = () => {
    if (statementPortalId) {
      const url = `https://portal.kensauto.ca/statement?cp_id=${statementPortalId}`;
      navigator.clipboard.writeText(url);
      alert("URL copied to clipboard!");
    }
  };

  if (!customer) return null;

  // Display transactions oldest first (same as CustomerARTransactions)
  const displayTransactions = [...(transactions || [])].filter(t => {
    const roundedBalance = Math.round((t.balance || 0) * 100) / 100;
    return Math.abs(roundedBalance) > 0;
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Statement of Account</DialogTitle>
          </DialogHeader>
          <div id="statement-print-area" className="flex-grow overflow-y-auto p-6 bg-white text-black">
            <style>{`
              @media print {
                body, html { -webkit-print-color-adjust: exact; }
                .no-print { display: none; }
              }
            `}</style>
            {/* Top Row: Logo and Statement Title */}
            <div className="flex justify-between items-start mb-8 border-b-2 border-black pb-4">
              <div>
                <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b90236f4d7e6ac0de4a262/bbd9a7847_KensAutoDieselRepair1.jpg" alt="Company Logo" style={{ height: '120px' }} />
              </div>
              <div className="text-right">
                <h3 className="text-3xl font-bold">STATEMENT</h3>
                <p>Date: {format(new Date(), 'PPP')}</p>
              </div>
            </div>

            {/* Second Row: Customer Info and Account Summary */}
            <div className="flex justify-between items-start mb-8" style={{ marginTop: '-4mm' }}>
              <div className="w-1/2 pr-4">
                <h2 className="text-xl font-bold">
                  {customer.org_name || `${customer.first_name} ${customer.last_name}`}
                </h2>
                {customer.org_name && (customer.first_name || customer.last_name) && (
                  <p className="text-sm">Contact: {customer.first_name} {customer.last_name}</p>
                )}
                <p>{customer.address}</p>
                <p>{customer.city}, {customer.state} {customer.zip_code}</p>
                <p>{customer.phone}</p>
              </div>
              <div className="w-1/2 pl-4">
                <h4 className="text-lg font-semibold mb-2">Account Summary</h4>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b"><td className="p-2">Current</td><td className="text-right p-2">${agedBalances.current.toFixed(2)}</td></tr>
                    <tr className="border-b"><td className="p-2">31-60 Days</td><td className="text-right p-2">${agedBalances['30'].toFixed(2)}</td></tr>
                    <tr className="border-b"><td className="p-2">61-90 Days</td><td className="text-right p-2">${agedBalances['60'].toFixed(2)}</td></tr>
                    <tr className="border-b"><td className="p-2">Over 90 Days</td><td className="text-right p-2">${agedBalances['90+'].toFixed(2)}</td></tr>
                    <tr className="bg-gray-100 font-bold"><td className="p-2">Balance Due</td><td className="text-right p-2">${agedBalances.total.toFixed(2)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Section: Transactions Table */}
            <table className="w-full text-sm mb-8">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Reference</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2">Charges</th>
                  <th className="text-right p-2">Payments</th>
                  <th className="text-right p-2">Owing</th>
                </tr>
              </thead>
              <tbody>
                {displayTransactions.map((t, index) => (
                  <tr key={t.id || index} className="border-b">
                    <td className="p-2">{t.date ? format(new Date(t.date), 'yyyy-MM-dd') : ''}</td>
                    <td className="p-2">{t.reference || ''}</td>
                    <td className="p-2">{t.description || ''}</td>
                    <td className="text-right p-2">
                      {(t.amount || 0) > 0 ? `$${(t.amount || 0).toFixed(2)}` : ''}
                    </td>
                    <td className="text-right p-2">
                      {(t.payment || 0) > 0 ? `$${(t.payment || 0).toFixed(2)}` : ''}
                    </td>
                    <td className="text-right p-2">${(t.balance || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {displayTransactions.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-4 text-center text-gray-500">
                      No transactions found for this customer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

          </div>
          <DialogFooter className="no-print flex-wrap sm:flex-nowrap justify-between items-center gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {statementPortalId && (
                  <>
                    <Button variant="outline" onClick={() => setShowEmailModal(true)}><Mail className="w-4 h-4 mr-2" /> Email</Button>
                    <Input
                      readOnly
                      value={`portal.kensauto.ca/statement?cp_id=${statementPortalId}`}
                      className="flex-grow min-w-[300px]"
                    />
                    <Button variant="outline" onClick={handleCopyUrl}><Copy className="w-4 h-4 mr-2" /> Copy</Button>
                  </>
              )}
            </div>
            <div className="flex items-center gap-2 self-end">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={handlePrint}><Printer className="w-4 h-4 mr-2" /> Print</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {showEmailModal && statementPortalId && (
        <StatementEmailModal
          open={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          customer={customer}
          portalUrl={`https://portal.kensauto.ca/statement?cp_id=${statementPortalId}`}
          agedBalances={agedBalances}
        />
      )}
    </>
  );
}