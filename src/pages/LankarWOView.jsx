import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LankarWOViewForm from '@/components/lankar/LankarWOViewForm';
import { getLankarWorkOrderData } from '@/functions/getLankarWorkOrderData';

const getStageMeta = (stage) => {
  const normalized = String(stage || '').toUpperCase();

  if (normalized === 'UINVOICE' || normalized === 'UPINVOICE') {
    return {
      label: 'Invoice',
      badgeClass: 'bg-green-600',
      documentNumber: 'invoiceid'
    };
  }

  if (normalized === 'UWO' || normalized === 'UPWO') {
    return {
      label: 'Work Order',
      badgeClass: 'bg-blue-600',
      documentNumber: 'woid'
    };
  }

  return {
    label: stage || 'Document',
    badgeClass: 'bg-slate-700',
    documentNumber: 'woid'
  };
};

export default function LankarWOView() {
  const urlParams = new URLSearchParams(window.location.search);
  const navigate = useNavigate();
  const woid = urlParams.get('woid');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const stageMeta = useMemo(
    () => getStageMeta(data?.info?.WOorPWOorEorINVorCRED),
    [data?.info?.WOorPWOorEorINVorCRED]
  );

  useEffect(() => {
    const loadData = async () => {
      if (!woid) {
        setError('Missing work order id');
        setLoading(false);
        return;
      }

      try {
        const response = await getLankarWorkOrderData({ woid });
        setData(response.data?.data || null);
      } catch (err) {
        setError(err?.response?.data?.error || err.message || 'Failed to load Lankar work order');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [woid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-600" />
          <p className="mt-4 text-slate-600">Loading Lankar work order...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.info) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-red-600" />
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Error Loading Lankar Work Order</h2>
          <p className="mt-2 text-slate-600">{error || 'Work order not found'}</p>
          <Button onClick={() => navigate('/Customers')} className="mt-4">Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden min-w-[200px]">
            <div className={`${stageMeta.badgeClass} px-4 py-1.5 text-white text-xs font-bold uppercase tracking-wider`}>
              {stageMeta.label}
            </div>
            <div className="px-4 py-2">
              <h1 className="text-xl font-bold text-slate-900">{data.info?.[stageMeta.documentNumber] || data.info?.woid}</h1>
              <p className="text-slate-500 text-xs">Lankar View</p>
            </div>
          </div>

          <Button variant="outline" onClick={() => window.close()} className="w-fit">
            <FileText className="w-4 h-4 mr-2" />
            Exit
          </Button>
        </div>

        <LankarWOViewForm
          info={data.info}
          customer={data.customer}
          vehicle={data.vehicle}
          lineItems={data.lines || []}
        />
      </div>
    </div>
  );
}