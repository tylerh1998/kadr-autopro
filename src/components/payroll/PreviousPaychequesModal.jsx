
import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Paycheque } from '@/entities/Paycheque';
import { format } from 'date-fns';

export default function PreviousPaychequesModal({ open, onClose, employee }) {
  const [paycheques, setPaycheques] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadPaycheques = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    try {
      const allPaycheques = await Paycheque.filter({ employee_id: employee.id }, '-pay_date');
      
      let filtered = allPaycheques;
      if (fromDate) {
        filtered = filtered.filter(p => new Date(p.pay_date) >= new Date(fromDate));
      }
      if (toDate) {
        filtered = filtered.filter(p => new Date(p.pay_date) <= new Date(toDate));
      }
      
      setPaycheques(filtered);
    } catch (error) {
      console.error('Error loading paycheques:', error);
    } finally {
      setLoading(false);
    }
  }, [employee, fromDate, toDate]);

  useEffect(() => {
    if (open && employee) {
      loadPaycheques();
    }
  }, [open, employee, loadPaycheques]);

  const handleFilter = () => {
    loadPaycheques();
  };
  
  const handleClearFilter = () => {
    setFromDate('');
    setToDate('');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Previous Paycheques for {employee?.first_name} {employee?.last_name}</DialogTitle>
          <DialogDescription>View and manage historical paycheque records.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4 p-4 border rounded-lg bg-slate-50 dark:bg-slate-800 dark:border-slate-700">
            <div className="space-y-1">
              <Label htmlFor="from-date">From</Label>
              <Input id="from-date" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to-date">To</Label>
              <Input id="to-date" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
            <Button onClick={handleFilter}>Filter</Button>
            <Button onClick={handleClearFilter} variant="outline">Clear</Button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto border rounded-md dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                <tr>
                  <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Pay Date</th>
                  <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Gross Pay</th>
                  <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Net Pay</th>
                  <th className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="4" className="text-center p-8">Loading...</td></tr>
                ) : paycheques.length > 0 ? (
                  paycheques.map(pc => (
                    <tr key={pc.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="p-3">{format(new Date(pc.pay_date), 'MMM d, yyyy')}</td>
                      <td className="p-3 font-medium">${pc.gross_pay.toFixed(2)}</td>
                      <td className="p-3 font-semibold text-green-700 dark:text-green-400">${pc.net_pay.toFixed(2)}</td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => alert('View details for this paycheque.')}>View</Button>
                        <Button variant="ghost" size="sm" onClick={() => alert('Edit this paycheque.')}>Edit</Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="4" className="text-center p-8 text-slate-500 dark:text-slate-400">No paycheques found for the selected criteria.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
