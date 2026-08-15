import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LankarWOViewForm from '@/components/lankar/LankarWOViewForm';
import { supabase } from '@/lib/supabase';

async function getLankarWorkOrderData({ woid, invoiceid }) {
  if (!woid && !invoiceid) {
    throw new Error('woid or invoiceid is required');
  }

  let infoResult;
  if (woid) {
    infoResult = await supabase.from('LankarWOInfo').select('*').eq('woid', woid).maybeSingle();
    if (infoResult.error) throw new Error(infoResult.error.message);

    if (!infoResult.data) {
      infoResult = await supabase.from('LankarWOInfo').select('*').eq('invoiceid', woid).maybeSingle();
      if (infoResult.error) throw new Error(infoResult.error.message);
    }
  } else {
    infoResult = await supabase.from('LankarWOInfo').select('*').eq('invoiceid', invoiceid).maybeSingle();
    if (infoResult.error) throw new Error(infoResult.error.message);
  }

  if (!infoResult.data) {
    throw new Error('Lankar work order not found');
  }

  const actualWoid = infoResult.data.woid;

  const linesResult = await supabase
    .from('LankarWOLines')
    .select('*')
    .eq('woid', actualWoid)
    .order('linenum', { ascending: true });
  if (linesResult.error) throw new Error(linesResult.error.message);

  const lines = linesResult.data || [];
  const inventoryIds = [...new Set(
    lines
      .map((line) => {
        const trimmedId = String(line.invinvid ?? '').trim();
        if (!trimmedId) return null;
        const parsedId = Number(trimmedId);
        return Number.isFinite(parsedId) ? parsedId : null;
      })
      .filter((value) => value !== null)
  )];

  let inventoryPartMap = {};
  if (inventoryIds.length > 0) {
    const inventoryResult = await supabase
      .from('LankarWOInventory')
      .select('invid, partnum')
      .in('invid', inventoryIds);
    if (inventoryResult.error) throw new Error(inventoryResult.error.message);

    inventoryPartMap = (inventoryResult.data || []).reduce((acc, item) => {
      acc[String(item.invid ?? '').trim()] = item.partnum || null;
      return acc;
    }, {});
  }

  const enrichedLines = lines.map((line) => {
    const inventoryKey = String(line.invinvid ?? '').trim();
    return {
      ...line,
      partnum: inventoryPartMap[inventoryKey] || null
    };
  });

  let customer = null;
  if (infoResult.data.cusid) {
    const customerResult = await supabase.from('Customer').select('*').eq('cusid', infoResult.data.cusid).maybeSingle();
    if (!customerResult.error) {
      customer = customerResult.data || null;
    }
  }

  let vehicle = null;
  if (infoResult.data.vehid) {
    const vehicleResult = await supabase.from('Vehicle').select('*').eq('vehid', infoResult.data.vehid).maybeSingle();
    if (!vehicleResult.error) {
      vehicle = vehicleResult.data || null;
    }
  }

  return {
    data: {
      info: infoResult.data,
      lines: enrichedLines,
      customer,
      vehicle
    }
  };
}

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
  const invoiceid = urlParams.get('invoiceid');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const stageMeta = useMemo(
    () => getStageMeta(data?.info?.WOorPWOorEorINVorCRED),
    [data?.info?.WOorPWOorEorINVorCRED]
  );

  useEffect(() => {
    const loadData = async () => {
      if (!woid && !invoiceid) {
        setError('Missing work order or invoice id');
        setLoading(false);
        return;
      }

      try {
        const response = await getLankarWorkOrderData({ woid, invoiceid });
        setData(response.data || null);
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
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading Lankar work order...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.info) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-red-600" />
          <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Error Loading Lankar Work Order</h2>
          <p className="mt-2 text-slate-600 dark:text-slate-400">{error || 'Work order not found'}</p>
          <Button onClick={() => window.close()} className="mt-4">Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden min-w-[200px]">
            <div className={`${stageMeta.badgeClass} px-4 py-1.5 text-white text-xs font-bold uppercase tracking-wider`}>
              {stageMeta.label}
            </div>
            <div className="px-4 py-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{data.info?.[stageMeta.documentNumber] || data.info?.woid}</h1>
              <p className="text-slate-500 dark:text-slate-400 text-xs">Lankar View</p>
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