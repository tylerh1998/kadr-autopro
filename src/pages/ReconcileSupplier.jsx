import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { ArrowLeft, DollarSign, Printer } from 'lucide-react';
import { format, parseISO, endOfMonth } from 'date-fns';
import { createPageUrl } from '@/utils';
import StatementUploadCard from '../components/suppliers/StatementUploadCard';
import ReconcileInvoiceGroup from '../components/suppliers/ReconcileInvoiceGroup';
import ReconcileErrorGroup from '../components/suppliers/ReconcileErrorGroup';
import AddToSheetModal from '../components/suppliers/AddToSheetModal';
import { matchStatementToAutoPro, findDiscrepancies } from '@/lib/reconcileMatching';
import { buildAppliedDetailsFromConceptualInvoice } from '@/lib/supplierInvoiceHelpers';

const safeFormatDate = (dateString, formatString = 'MM/dd/yyyy') => {
  if (!dateString || dateString === '') return 'N/A';
  try {
    const parsed = parseISO(dateString);
    if (isNaN(parsed.getTime())) return 'N/A';
    return format(parsed, formatString);
  } catch {
    return 'N/A';
  }
};

const mapAutoproToItem = (invoice, extra = {}) => ({
  key: `${invoice.invoice_number}__${invoice.invoice_date}`,
  invoice_number: invoice.invoice_number,
  invoice_date: invoice.invoice_date,
  subtotal: invoice.subtotal,
  tax_amount: invoice.tax_amount,
  total_amount: invoice.total_amount,
  line_count: invoice.line_count,
  lines: invoice.lines,
  ...extra,
});

const mapStatementToItem = (statementInvoice, index) => ({
  key: `stmt_${index}`,
  invoice_number: statementInvoice.invoice_number,
  invoice_date: statementInvoice.invoice_date,
  subtotal: null,
  tax_amount: null,
  total_amount: parseFloat(statementInvoice.amount) || 0,
  line_count: null,
  lines: null,
});

export default function ReconcileSupplierPage() {
  const [supplier, setSupplier] = useState(null);
  const [autoproInvoices, setAutoproInvoices] = useState([]);
  const [statementInvoices, setStatementInvoices] = useState([]);
  const [statementSummary, setStatementSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [selectedMatchedKeys, setSelectedMatchedKeys] = useState(new Set());
  const [showAddToSheetModal, setShowAddToSheetModal] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const supplierId = new URLSearchParams(location.search).get('id');

  useEffect(() => {
    if (!supplierId) navigate(createPageUrl('Suppliers'));
  }, [supplierId, navigate]);

  const loadData = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('autopro-getSupplierReconcileInvoices', { body: { supplierId } });
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to fetch reconcile data');
      setSupplier(response.data.data.supplier);
      setAutoproInvoices(response.data.data.conceptualInvoices || []);
    } catch (err) {
      console.error('Error loading reconcile data:', err);
      alert('Failed to load supplier data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => { loadData(); }, [loadData]);

  const matchResult = useMemo(
    () => matchStatementToAutoPro(statementInvoices, autoproInvoices),
    [statementInvoices, autoproInvoices]
  );

  const discrepancyResult = useMemo(
    () => findDiscrepancies(matchResult.notInAutoPro, matchResult.notOnStatement),
    [matchResult]
  );

  const notInAutoProItems = useMemo(
    () => discrepancyResult.notInAutoPro.map((statementInvoice, index) => mapStatementToItem(statementInvoice, index)),
    [discrepancyResult]
  );
  // AutoPro invoices dated after the statement's own period end aren't real discrepancies -
  // it's normal to reconcile before every post-period entry exists yet. Split them out of
  // "Not On Statement" into their own lower-priority section rather than excluding them
  // entirely (an invoice could always be dated wrong and genuinely belong in-period).
  const periodEnd = statementSummary?.periodEnd || null;

  const { notOnStatementItems, afterPeriodEndItems } = useMemo(() => {
    const allItems = discrepancyResult.notOnStatement.map((invoice) => mapAutoproToItem(invoice));
    if (!periodEnd) {
      return { notOnStatementItems: allItems, afterPeriodEndItems: [] };
    }
    const inPeriod = [];
    const afterPeriod = [];
    allItems.forEach((item) => {
      if (item.invoice_date && item.invoice_date > periodEnd) {
        afterPeriod.push(item);
      } else {
        inPeriod.push(item);
      }
    });
    return { notOnStatementItems: inPeriod, afterPeriodEndItems: afterPeriod };
  }, [discrepancyResult, periodEnd]);
  const matchedItems = useMemo(
    () => matchResult.matched.map((pair) => mapAutoproToItem(pair.autopro, { dateMismatch: pair.dateMismatch, statementDate: pair.statement.invoice_date })),
    [matchResult]
  );

  useEffect(() => {
    setSelectedMatchedKeys(new Set(matchedItems.map((item) => item.key)));
  }, [matchedItems]);

  const selectedMatchedTotal = useMemo(
    () => matchedItems
      .filter((item) => selectedMatchedKeys.has(item.key))
      .reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0),
    [matchedItems, selectedMatchedKeys]
  );

  const toggleMatchedSelection = (key) => {
    setSelectedMatchedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleFileSelect = (selectedFile) => {
    setFile(selectedFile);
    setError(null);
  };

  const handleClearFile = () => {
    setFile(null);
    setError(null);
    setStatementSummary(null);
  };

  const handleReconcile = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setProgress('Uploading statement...');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `temp/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('kadr-digital_invoice_uploads')
        .upload(storagePath, file);

      if (uploadError) throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);

      setProgress('Extracting invoices from statement...');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const url = `${supabaseUrl}/functions/v1/autopro-processSupplierStatementOCR?t=${Date.now()}`;

      const match = document.cookie.match(/(?:^|;\s*)supabase_auth_token=([^;]+)/);
      let jwtToken = supabaseAnonKey;
      if (match) {
        try {
          let rawValue = match[1];
          if (rawValue.startsWith('%7B')) rawValue = decodeURIComponent(rawValue);
          const sessionData = JSON.parse(rawValue);
          jwtToken = Array.isArray(sessionData) ? sessionData[0]?.access_token : sessionData?.access_token;
        } catch {}
      }

      const fetchResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
        body: JSON.stringify({ storagePath, mimeType: file.type || 'application/pdf' }),
      });

      if (!fetchResponse.ok) {
        let errorMsg = `Server returned status ${fetchResponse.status}`;
        try {
          const errorData = await fetchResponse.json();
          if (errorData.error) errorMsg += `: ${errorData.error}`;
        } catch {}
        throw new Error(errorMsg);
      }

      const responseData = await fetchResponse.json();
      if (!responseData || !responseData.success) {
        throw new Error(responseData?.error || 'Failed to process statement');
      }

      setStatementInvoices(responseData.data?.invoices || []);
      setStatementSummary({
        periodStart: responseData.data?.period_start || null,
        periodEnd: responseData.data?.period_end || null,
        totalAmountDue: responseData.data?.total_amount_due != null ? parseFloat(responseData.data.total_amount_due) : null,
      });
    } catch (err) {
      console.error('Statement reconcile error:', err);
      setError(err.message || 'An error occurred while reconciling the statement.');
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  };

  const handleBack = () => navigate(createPageUrl(`SupplierTx?id=${supplierId}`));

  const handlePrint = () => window.print();

  const printSections = [
    { key: 'notInAutoPro', title: 'Not In AutoPro', items: notInAutoProItems },
    { key: 'notOnStatement', title: 'Not On Statement', items: notOnStatementItems },
    { key: 'afterPeriodEnd', title: 'After Statement Period', items: afterPeriodEndItems },
    { key: 'matched', title: 'Matched', items: matchedItems },
  ];

  if (loading) {
    return <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center"><div className="text-center"><div className="text-lg font-semibold dark:text-slate-100">Loading supplier data...</div><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mt-4"></div></div></div>;
  }

  return (
    <>
      <style>{`
        .reconcile-print-report { display: none; }
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden; }
          .reconcile-print-report, .reconcile-print-report * { visibility: visible; }
          .reconcile-print-report {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          body { background-color: white !important; }
          .print-header { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
          .print-logo { width: 100%; max-width: 200px; height: auto; flex-shrink: 0; }
          .print-header-text { flex: 1; }
          .print-title { font-size: 18px; font-weight: bold; margin-bottom: 4px; text-align: left; color: #000; }
          .print-subtitle { font-size: 13px; text-align: left; color: #333; }
          .report-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
          .report-summary-card { border: 1px solid #000; padding: 10px; break-inside: avoid; }
          .report-summary-title { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; color: #000; }
          .report-summary-count { font-size: 11px; color: #555; margin-bottom: 6px; }
          .report-summary-total { font-size: 16px; font-weight: bold; color: #000; }
          .report-section { page-break-inside: avoid; margin-bottom: 20px; }
          .report-section-title { font-size: 14px; font-weight: bold; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid #000; color: #000; }
          .report-table { border-collapse: collapse; width: 100%; font-size: 11px; margin-bottom: 10px; }
          .report-table th, .report-table td { border: 1px solid #000; padding: 4px 6px; text-align: left; color: #000; }
          .report-table th { background-color: #f0f0f0 !important; font-weight: bold; }
          .report-table td:nth-child(3), .report-table td:nth-child(4), .report-table td:nth-child(5) { text-align: right; }
          .report-section-error .report-section-title { color: #b91c1c; border-bottom-color: #b91c1c; }
          .report-error-table th { background-color: #fee2e2 !important; }
          .report-error-table td:nth-child(4), .report-error-table td:nth-child(7), .report-error-table td:nth-child(8) { text-align: right; }
        }
      `}</style>
      <div className="p-6 min-h-screen">
        <div className="max-w-screen-xl mx-auto space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button variant="outline" onClick={handleBack} className="bg-slate-900 text-white hover:bg-slate-800 hover:text-white border-slate-900">
              <ArrowLeft className="w-4 h-4 mr-2" />Back
            </Button>
            <div className="min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 shadow-sm">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate max-w-[600px]" title={supplier?.name}>{supplier?.name}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Reconcile Supplier Statement</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Printer className="w-4 h-4 mr-2" />
              Print Report
            </Button>
            <Button
              onClick={() => setShowAddToSheetModal(true)}
              disabled={selectedMatchedKeys.size === 0}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Add to Cash Flow ({selectedMatchedTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })})
            </Button>
          </div>
        </div>

        <StatementUploadCard
          file={file}
          onFileSelect={handleFileSelect}
          onClear={handleClearFile}
          onSubmit={handleReconcile}
          processing={processing}
          progress={progress}
          error={error}
          statementSummary={statementSummary}
          safeFormatDate={safeFormatDate}
        />

        <ReconcileErrorGroup errors={discrepancyResult.errors} safeFormatDate={safeFormatDate} />

        <ReconcileInvoiceGroup
          title="Not In AutoPro"
          items={notInAutoProItems}
          accentClass="text-red-600 dark:text-red-400"
          safeFormatDate={safeFormatDate}
          emptyMessage="Every invoice on the statement matches an AutoPro record."
        />

        <ReconcileInvoiceGroup
          title="Not On Statement"
          items={notOnStatementItems}
          accentClass="text-amber-600 dark:text-amber-400"
          safeFormatDate={safeFormatDate}
          emptyMessage="No outstanding AutoPro invoices are missing from the statement."
        />

        {periodEnd && (
          <ReconcileInvoiceGroup
            title="After Statement Period"
            items={afterPeriodEndItems}
            accentClass="text-teal-600 dark:text-teal-400"
            safeFormatDate={safeFormatDate}
            emptyMessage="No AutoPro invoices are dated after the statement period end."
          />
        )}

        <ReconcileInvoiceGroup
          title="Matched"
          items={matchedItems}
          accentClass="text-green-600 dark:text-green-400"
          safeFormatDate={safeFormatDate}
          selectable
          selectedKeys={selectedMatchedKeys}
          onToggleSelect={toggleMatchedSelection}
          emptyMessage="Upload a statement to see matched invoices here."
        />
      </div>

      <div className="reconcile-print-report">
        <div className="print-header">
          <img
            src="https://hbcrwkmgsazqrvsrmxyr.supabase.co/storage/v1/object/public/KADR/KADRLogoAddress.jpg"
            alt="Ken's Auto & Diesel Repair"
            className="print-logo"
          />
          <div className="print-header-text">
            <div className="print-title">Supplier Statement Reconciliation Report</div>
            <div className="print-subtitle">
              <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '6px' }}>{supplier?.name}</div>
              <div>Report Date: {format(new Date(), 'MMM d, yyyy h:mm a')}</div>
              {file && <div>Statement File: {file.name}</div>}
            </div>
          </div>
        </div>

        <div className="report-summary-grid">
          {printSections.map((section) => {
            const total = section.items.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
            return (
              <div key={section.key} className="report-summary-card">
                <div className="report-summary-title">{section.title}</div>
                <div className="report-summary-count">{section.items.length} invoice{section.items.length !== 1 ? 's' : ''}</div>
                <div className="report-summary-total">${total.toFixed(2)}</div>
              </div>
            );
          })}
        </div>

        {discrepancyResult.errors.length > 0 && (
          <div className="report-section report-section-error">
            <h2 className="report-section-title">Errors</h2>
            <table className="report-table report-error-table">
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Statement Inv #</th>
                  <th>Statement Date</th>
                  <th>Statement Amt</th>
                  <th>AutoPro Inv #</th>
                  <th>AutoPro Date</th>
                  <th>AutoPro Amt</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {discrepancyResult.errors.map((err) => (
                  <tr key={err.key}>
                    <td>{err.reason}</td>
                    <td>{err.statement.invoice_number || '—'}</td>
                    <td>{safeFormatDate(err.statement.invoice_date, 'MMM dd, yyyy')}</td>
                    <td>${(parseFloat(err.statement.amount) || 0).toFixed(2)}</td>
                    <td>{err.autopro.invoice_number || '—'}</td>
                    <td>{safeFormatDate(err.autopro.invoice_date, 'MMM dd, yyyy')}</td>
                    <td>${(parseFloat(err.autopro.total_amount) || 0).toFixed(2)}</td>
                    <td>${Math.abs(parseFloat(err.difference) || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {printSections.map((section) => (
          <div key={section.key} className="report-section">
            <h2 className="report-section-title">{section.title}</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Subtotal</th>
                  <th>GST</th>
                  <th>Total</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {section.items.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center' }}>None</td></tr>
                ) : (
                  section.items.map((item) => (
                    <tr key={item.key}>
                      <td>{item.invoice_number || '—'}</td>
                      <td>{safeFormatDate(item.invoice_date, 'MMM dd, yyyy')}</td>
                      <td>{item.subtotal != null ? `$${item.subtotal.toFixed(2)}` : '—'}</td>
                      <td>{item.tax_amount != null ? `$${item.tax_amount.toFixed(2)}` : '—'}</td>
                      <td>${(parseFloat(item.total_amount) || 0).toFixed(2)}</td>
                      <td>{item.dateMismatch ? `Date mismatch — statement: ${safeFormatDate(item.statementDate, 'MMM dd, yyyy')}` : ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <AddToSheetModal
        open={showAddToSheetModal}
        onClose={() => setShowAddToSheetModal(false)}
        initialValues={{
          supplierName: supplier?.name,
          supplierId: supplier?.id,
          amount: selectedMatchedTotal.toFixed(2),
          dueDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
          supplierInvoiceLineIds: matchedItems
            .filter(item => selectedMatchedKeys.has(item.key))
            .flatMap(item => buildAppliedDetailsFromConceptualInvoice(item).map(d => d.id))
            .filter(Boolean)
        }}
        onSuccess={() => setSelectedMatchedKeys(new Set())}
      />
      </div>
    </>
  );
}
