import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { createPageUrl } from '@/utils';
import StatementUploadCard from '../components/suppliers/StatementUploadCard';
import ReconcileInvoiceGroup from '../components/suppliers/ReconcileInvoiceGroup';
import { matchStatementToAutoPro } from '@/lib/reconcileMatching';

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
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [selectedMatchedKeys, setSelectedMatchedKeys] = useState(new Set());

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

  const notInAutoProItems = useMemo(
    () => matchResult.notInAutoPro.map((statementInvoice, index) => mapStatementToItem(statementInvoice, index)),
    [matchResult]
  );
  const notOnStatementItems = useMemo(
    () => matchResult.notOnStatement.map((invoice) => mapAutoproToItem(invoice)),
    [matchResult]
  );
  const matchedItems = useMemo(
    () => matchResult.matched.map((pair) => mapAutoproToItem(pair.autopro, { dateMismatch: pair.dateMismatch, statementDate: pair.statement.invoice_date })),
    [matchResult]
  );

  useEffect(() => {
    const validKeys = new Set(matchedItems.map((item) => item.key));
    setSelectedMatchedKeys((prev) => new Set(Array.from(prev).filter((key) => validKeys.has(key))));
  }, [matchedItems]);

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
    } catch (err) {
      console.error('Statement reconcile error:', err);
      setError(err.message || 'An error occurred while reconciling the statement.');
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  };

  const handleBack = () => navigate(createPageUrl(`SupplierTx?id=${supplierId}`));

  if (loading) {
    return <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center"><div className="text-center"><div className="text-lg font-semibold dark:text-slate-100">Loading supplier data...</div><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mt-4"></div></div></div>;
  }

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-screen-xl mx-auto space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button variant="outline" onClick={handleBack} className="bg-slate-900 text-white hover:bg-slate-800 hover:text-white border-slate-900">
            <ArrowLeft className="w-4 h-4 mr-2" />Back
          </Button>
          <div className="min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate max-w-[600px]" title={supplier?.name}>{supplier?.name}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Reconcile Supplier Statement</p>
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
        />

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
    </div>
  );
}
