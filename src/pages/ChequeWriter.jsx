import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, AlertCircle, BookCheck, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ChequeWriter() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [chequeReference, setChequeReference] = useState(null);
  const [supplierId, setSupplierId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadCheque = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const ref = urlParams.get('chequeReference');
        
        if (!ref) {
          setError('No cheque reference provided');
          setLoading(false);
          return;
        }

        setChequeReference(ref);
        console.log('ChequeWriter: Loading cheque for reference:', ref);

        const { data: paymentMatches } = await supabase
          .from('SupplierPayment')
          .select('*')
          .eq('cheque_number', String(ref));
        const payment = paymentMatches?.[0];

        if (payment?.supplier_id) {
          setSupplierId(payment.supplier_id);
        }

        const { data, error: invokeError } = await supabase.functions.invoke('autopro-generateChequePDF', {
          body: { chequeReference: ref }
        });

        console.log('ChequeWriter: PDF generation response:', { data, invokeError });

        if (invokeError) {
          setError(invokeError.message || 'Failed to generate PDF');
          setLoading(false);
        } else if (data?.error) {
          setError(data.error);
          setLoading(false);
        } else if (data) {
          const blob = new Blob([data], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
          setLoading(false);
        } else {
          setError('Failed to generate PDF');
          setLoading(false);
        }
      } catch (err) {
        console.error('ChequeWriter: Error loading cheque:', err);
        setError(err.message || 'Failed to load cheque');
        setLoading(false);
      }
    };

    loadCheque();

    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, []);



  const handleBack = () => {
    if (supplierId) {
      const url = createPageUrl('SupplierTx') + `?id=${supplierId}`;
      window.location.href = url;
    } else {
      navigate(-1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-5xl mx-auto">
          <Card>
            <CardContent className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600 dark:text-slate-400">Generating cheque...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-5xl mx-auto">
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Error Loading Cheque</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">{error}</p>
              <Button onClick={handleBack} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Cheque Preview</h1>
          <div className="flex gap-3">
            <Button onClick={handleBack} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Supplier Transactions
            </Button>
            <Button onClick={() => window.location.href = createPageUrl('APSummary')} variant="outline">
              <BookOpen className="w-4 h-4 mr-2" />
              AP Summary
            </Button>
            <Button onClick={() => window.location.href = createPageUrl('ChequeRegister')} variant="outline">
              <BookCheck className="w-4 h-4 mr-2" />
              Cheque Register
            </Button>

          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <iframe
              src={pdfUrl}
              className="w-full h-[800px]"
              title="Cheque Preview"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}