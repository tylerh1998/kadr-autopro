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

  const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

  const buildStatementIframeHtml = (items) => `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Statement of Account</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            background: white;
            color: black;
            font-family: Arial, sans-serif;
          }
          @media print {
            body, html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          .top-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 32px;
            border-bottom: 2px solid black;
            padding-bottom: 16px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 32px;
            margin-top: -4mm;
            gap: 24px;
          }
          .left-col, .right-col {
            width: 50%;
          }
          .statement-title {
            font-size: 22px;
            font-weight: 700;
            margin: 0 0 8px;
            line-height: 1.15;
          }
          .customer-name {
            font-size: 22px;
            font-weight: 700;
            margin: 0 0 8px;
            line-height: 1.15;
          }
          .summary-title {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 16px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          th, td {
            padding: 8px;
          }
          .summary-table tr.border-b,
          .transactions-table tr.border-b {
            border-bottom: 1px solid #d1d5db;
          }
          .transactions-table thead tr {
            border-bottom: 2px solid black;
          }
          .text-right {
            text-align: right;
          }
          .text-left {
            text-align: left;
          }
          .balance-row {
            background: #f3f4f6;
            font-weight: 700;
          }
          .empty-state {
            padding: 16px;
            text-align: center;
            color: #6b7280;
          }
          img {
            max-width: 100%;
          }
        </style>
      </head>
      <body>
        <div class="top-row">
          <div>
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b90236f4d7e6ac0de4a262/bbd9a7847_KensAutoDieselRepair1.jpg" alt="Company Logo" style="height: 120px;" />
          </div>
          <div style="text-align: right;">
            <h3 class="statement-title">Statement of Account</h3>
            <p style="margin: 0;">Date: ${formatStatementDate(getMountainToday())}</p>
          </div>
        </div>

        <div class="summary-row">
          <div class="left-col">
            <h2 class="customer-name">${customer?.org_name || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()}</h2>
            ${customer?.org_name && (customer?.first_name || customer?.last_name) ? `<p style="margin: 0 0 8px; font-size: 14px;">Contact: ${customer?.first_name || ''} ${customer?.last_name || ''}</p>` : ''}
            <p style="margin: 0 0 8px;">${customer?.address || ''}</p>
            <p style="margin: 0 0 8px;">${customer?.city || ''}${customer?.city && customer?.state ? ', ' : ''}${customer?.state || ''} ${customer?.zip_code || ''}</p>
            <p style="margin: 0;">${customer?.phone || ''}</p>
          </div>
          <div class="right-col">
            <h4 class="summary-title">Account Summary</h4>
            <table class="summary-table">
              <tbody>
                <tr class="border-b"><td>Current</td><td class="text-right">${formatCurrency(agedBalances.current)}</td></tr>
                <tr class="border-b"><td>31-60 Days</td><td class="text-right">${formatCurrency(agedBalances['30'])}</td></tr>
                <tr class="border-b"><td>61-90 Days</td><td class="text-right">${formatCurrency(agedBalances['60'])}</td></tr>
                <tr class="border-b"><td>Over 90 Days</td><td class="text-right">${formatCurrency(agedBalances['90+'])}</td></tr>
                <tr class="balance-row"><td>Balance Due</td><td class="text-right">${formatCurrency(agedBalances.total)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <table class="transactions-table">
          <thead>
            <tr>
              <th class="text-left">Date</th>
              <th class="text-left">Reference</th>
              <th class="text-left">Description</th>
              <th class="text-right">Charges</th>
              <th class="text-right">Payments</th>
              <th class="text-right">Owing</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map((t, index) => `
              <tr class="border-b" key="${t.id || index}">
                <td>${formatStatementDate(t.date)}</td>
                <td>${t.reference || ''}</td>
                <td>${t.description || ''}</td>
                <td class="text-right">${(t.amount || 0) > 0 ? formatCurrency(t.amount) : ''}</td>
                <td class="text-right">${(t.payment || 0) > 0 ? formatCurrency(t.payment) : ''}</td>
                <td class="text-right">${formatCurrency(t.balance)}</td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="6" class="empty-state">No transactions found for this customer.</td>
              </tr>
            `}
          </tbody>
        </table>
      </body>
    </html>
  `;

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

  useEffect(() => {
    if (!open || !customer) return;

    const iframe = document.getElementById('statement-iframe');
    const iframeDocument = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!iframeDocument) return;

    const items = [...(transactions || [])].filter((t) => {
      const roundedBalance = Math.round((t.balance || 0) * 100) / 100;
      return Math.abs(roundedBalance) > 0;
    });

    iframeDocument.open();
    iframeDocument.write(buildStatementIframeHtml(items));
    iframeDocument.close();
  }, [open, customer, transactions, agedBalances]);
  
  const handlePrint = () => {
    const iframe = document.getElementById('statement-iframe');
    iframe?.contentWindow?.focus();
    iframe?.contentWindow?.print();
  };

  const handleCopyUrl = () => {
    if (statementPortalId) {
      const url = `https://portal.kensauto.ca/statement?cp_id=${statementPortalId}`;
      navigator.clipboard.writeText(url);
      alert("URL copied to clipboard!");
    }
  };

  if (!customer) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[90vh] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Statement of Account</DialogTitle>
          </DialogHeader>
          <iframe id="statement-iframe" title="Statement Preview" className="flex-1 min-h-0 w-full border-none bg-white" />
          <DialogFooter className="no-print flex-wrap sm:flex-nowrap justify-between items-center gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {statementPortalId && (
                  <>
                    <Button variant="outline" onClick={() => setShowEmailModal(true)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"><Mail className="w-4 h-4 mr-2" /> Email</Button>
                    <Input
                      readOnly
                      value={`portal.kensauto.ca/statement?cp_id=${statementPortalId}`}
                      className="flex-grow min-w-[300px] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                    />
                    <Button variant="outline" onClick={handleCopyUrl} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"><Copy className="w-4 h-4 mr-2" /> Copy</Button>
                  </>
              )}
            </div>
            <div className="flex items-center gap-2 self-end">
              <Button variant="outline" onClick={onClose} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700">Close</Button>
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