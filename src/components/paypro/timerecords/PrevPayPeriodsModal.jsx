import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lock, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

export default function PrevPayPeriodsModal({ isOpen, onClose }) {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (isOpen) {
      loadPeriods();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadPeriods = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('PayPeriods').select('*');
      if (error) throw error;

      const sortedPeriods = (data || []).sort((a, b) => new Date(b.date_from) - new Date(a.date_from));

      setPeriods(sortedPeriods);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error loading pay periods:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Previous Pay Periods (Locked)
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : periods.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">No locked pay periods found.</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead className="text-right">Regular</TableHead>
                  <TableHead className="text-right">OT</TableHead>
                  <TableHead className="text-right">PTO</TableHead>
                  <TableHead className="text-right">Stat</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((period, index) => (
                  <TableRow key={period.id || index}>
                    <TableCell className="font-medium">
                      {new Date(period.date_from + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} -{' '}
                      {new Date(period.date_to + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </TableCell>
                    <TableCell className="text-right">{period.total_records || 0}</TableCell>
                    <TableCell className="text-right">{(period.total_regular_hours || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{(period.total_overtime_hours || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{(period.total_pto_hours || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{(period.total_stat_hours || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-1 w-fit text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-800">
                        <Lock className="w-3 h-3" />
                        Locked
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {periods.length > itemsPerPage && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, periods.length)} of {periods.length} periods
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(Math.ceil(periods.length / itemsPerPage), p + 1))}
                    disabled={currentPage >= Math.ceil(periods.length / itemsPerPage)}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
