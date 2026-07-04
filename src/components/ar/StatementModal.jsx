import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Printer, Mail, Copy } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Statement } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import StatementEmailModal from './StatementEmailModal';

export default function StatementModal({ open, onClose, customer }) {
  const [transactions, setTransactions] = useState([]);
  const [agedBalances, setAgedBalances] = useState({ current: 0, '30': 0, '60': 0, '90+': 0, total: 0 });
  const [statementPortalId, setStatementPortalId] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const formatStatementDate = (value) => {
    if (!value) return '';

    const parsedDate = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? parseISO(`${value}T12:00:00`)
      : new Date(value);

    return isValid(parsedDate) ? format(parsedDate, 'MMM d, yyyy') : '';
  };

  const getMountainToday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Edmonton',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());

    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  };

  useEffect(() => {
    const createStatementRecord = async () => {
      if (!open || !customer) return;

      try {
        const outstandingResponse = await base44.functions.invoke('getOutstandingARItems', {
          customerId: customer.id
        });

        if (!outstandingResponse.data?.success) {
          console.error('Failed to load outstanding items:', outstandingResponse.data?.error);
          return;
        }

        const outstandingItems = [...(outstandingResponse.data.items || [])]
          .filter((item) => Math.abs(Number(item.balance || 0)) > 0)
          .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

        setTransactions(outstandingItems);

        const calculatedAgedBalances = outstandingItems.reduce((acc, item) => {
          const balance = Number(item.balance || 0);
          const ageDays = Number(item.age_days || 0);

          if (ageDays <= 30) acc.current += balance;
          else if (ageDays <= 60) acc['30'] += balance;
          else if (ageDays <= 90) acc['60'] += balance;
          else acc['90+'] += balance;

          return acc;
        }, { current: 0, '30': 0, '60': 0, '90+': 0, total: 0 });

        calculatedAgedBalances.total = calculatedAgedBalances.current + calculatedAgedBalances['30'] + calculatedAgedBalances['60'] + calculatedAgedBalances['90+'];
        setAgedBalances(calculatedAgedBalances);

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
          statement_date: getMountainToday(),
          transactions: JSON.stringify(outstandingItems),
          aged_balances: JSON.stringify(calculatedAgedBalances),
          total_balance_due: calculatedAgedBalances.total,
        };

        await Statement.create(newStatement);
        setStatementPortalId(newStatement.cp_id);
        console.log("Statement record created successfully:", newStatement);
      } catch (error) {
        console.error("Failed to create statement record:", error);
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
                <p>Date: {formatStatementDate(getMountainToday())}</p>
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
                    <td className="p-2">{formatStatementDate(t.date)}</td>
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