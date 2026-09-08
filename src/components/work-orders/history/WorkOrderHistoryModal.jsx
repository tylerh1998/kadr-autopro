import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ModalCloseButton from '@/components/ui/modal-close-button';
import { format } from 'date-fns';
import { toMountainTime } from '@/components/utils/mountainTimeUtils';
import HistoryCard from './HistoryCard';
import WorkOrderHistoryDetailModal from './WorkOrderHistoryDetailModal';
import { formatAuditUserDisplay } from '@/utils/userDisplayUtils';

const PAGE_SIZE = 50;

function formatMountainDateTimeSafe(value) {
  if (!value) return '';
  try {
    const rawValue = String(value).trim();
    if (!rawValue) return '';
    let normalizedValue = rawValue.replace(' ', 'T');
    if (/([+-]\d{2})$/.test(normalizedValue)) {
      normalizedValue += ':00';
    }
    const dateObj = new Date(normalizedValue);
    if (Number.isNaN(dateObj.getTime())) return String(value);
    return format(toMountainTime(dateObj), 'MMM d, yyyy h:mm a');
  } catch {
    return String(value);
  }
}

async function resolveUserName(email, employees) {
  const display = formatAuditUserDisplay(email, employees);
  if (display !== email || !email) return display;
  const { data: matchedEmployees } = await supabase.from('Employee').select('full_name').eq('email', email);
  const matched = matchedEmployees?.[0];
  return matched?.full_name || email;
}

export default function WorkOrderHistoryModal({ open, onClose, workOrderId, employees = [] }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    if (!open || !workOrderId) return;

    const loadHistory = async () => {
      setLoading(true);
      const { data: rawRecordsData, error } = await supabase
        .from('workorderversionhistory')
        .select('*')
        .eq('workorder_id', workOrderId)
        .order('changed_at', { ascending: false });
      if (error) console.error('Error loading work order history:', error);
      const rawRecords = rawRecordsData || [];
      const enriched = await Promise.all(
        rawRecords.map(async (record) => ({
          ...record,
          changed_by_display: await resolveUserName(record.changed_by, employees)
        }))
      );
      setRecords(enriched);
      setPage(0);
      setLoading(false);
    };

    loadHistory();
  }, [open, workOrderId, employees]);

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const timeA = new Date(a?.changed_at || 0).getTime();
      const timeB = new Date(b?.changed_at || 0).getTime();
      return timeB - timeA;
    });
  }, [records]);

  const visibleRecords = useMemo(() => {
    const seenSessions = new Set();

    return sortedRecords.filter((record) => {
      const sessionId = record?.session_id;
      if (!sessionId) return true;
      if (seenSessions.has(sessionId)) return false;
      seenSessions.add(sessionId);
      return true;
    });
  }, [sortedRecords]);

  const pagedRecords = useMemo(() => {
    const start = page * PAGE_SIZE;
    return visibleRecords.slice(start, start + PAGE_SIZE);
  }, [visibleRecords, page]);

  const totalPages = Math.max(1, Math.ceil(visibleRecords.length / PAGE_SIZE));

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto [&>button:last-child]:hidden">
          <ModalCloseButton onClick={onClose} />
          <DialogHeader className="pr-16">
            <DialogTitle>Work Order Version History</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="py-16 flex items-center justify-center gap-3 text-slate-600 dark:text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading history...</span>
            </div>
          ) : visibleRecords.length === 0 ? (
            <div className="py-16 text-center text-slate-500 dark:text-slate-400">No version history available for this work order.</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {pagedRecords.map((record) => (
                  <HistoryCard
                    key={record.id}
                    record={record}
                    onClick={() => setSelectedRecord(record)}
                    formatDateTime={formatMountainDateTimeSafe}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">Page {page + 1} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={page === 0} onClick={() => setPage((prev) => prev - 1)}>Previous</Button>
                  <Button variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((prev) => prev + 1)}>Next</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <WorkOrderHistoryDetailModal
        open={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        record={selectedRecord}
        allRecords={visibleRecords}
        formatDateTime={formatMountainDateTimeSafe}
        onSelectRecord={setSelectedRecord}
      />
    </>
  );
}