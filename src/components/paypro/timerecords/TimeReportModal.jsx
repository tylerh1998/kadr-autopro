import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FileText, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function TimeReportModal({ isOpen, onClose, employees }) {
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [generating, setGenerating] = useState(false);

  const handleEmployeeToggle = (empId, checked) => {
    setSelectedEmployees((prev) => (checked ? [...prev, empId] : prev.filter((id) => id !== empId)));
  };

  const handleSelectAll = (checked) => {
    setSelectedEmployees(checked ? employees.map((e) => e.id) : []);
  };

  const handleGenerate = async () => {
    if (!dateRange.start || !dateRange.end) {
      alert('Please select a date range.');
      return;
    }
    if (selectedEmployees.length === 0) {
      alert('Please select at least one employee.');
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('paypro-generateTimeReport', {
        body: {
          employeeIds: selectedEmployees,
          startDate: dateRange.start,
          endDate: dateRange.end,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const blob = new Blob([data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TimeReport_${dateRange.start}_to_${dateRange.end}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      onClose();
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error generating report: ' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const setQuickDate = (type) => {
    const today = new Date();
    let start, end;

    switch (type) {
      case 'thisPayPeriod': {
        const day = today.getDate();
        const year = today.getFullYear();
        const month = today.getMonth();
        if (day <= 15) {
          start = new Date(year, month, 1);
          end = new Date(year, month, 15);
        } else {
          start = new Date(year, month, 16);
          end = new Date(year, month + 1, 0);
        }
        break;
      }
      case 'lastPayPeriod': {
        const day = today.getDate();
        let year = today.getFullYear();
        let month = today.getMonth();
        if (day <= 15) {
          month = month - 1;
          if (month < 0) {
            month = 11;
            year--;
          }
          start = new Date(year, month, 16);
          end = new Date(year, month + 1, 0);
        } else {
          start = new Date(year, month, 1);
          end = new Date(year, month, 15);
        }
        break;
      }
      default:
        return;
    }

    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Generate Time Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Date Range */}
          <div className="space-y-3">
            <Label className="font-semibold">Date Range</Label>
            <div className="flex gap-2 mb-2">
              <Button variant="outline" size="sm" onClick={() => setQuickDate('thisPayPeriod')}>
                This Pay Period
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickDate('lastPayPeriod')}>
                Last Pay Period
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm text-slate-500 dark:text-slate-400">Start Date</Label>
                <Input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-slate-500 dark:text-slate-400">End Date</Label>
                <Input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Employee Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Select Employees</Label>
              <div className="flex items-center gap-2">
                <Checkbox checked={selectedEmployees.length === employees.length && employees.length > 0} onCheckedChange={handleSelectAll} />
                <span className="text-sm text-slate-600 dark:text-slate-400">Select All</span>
              </div>
            </div>
            <div className="border rounded-lg max-h-60 overflow-y-auto">
              {employees.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  onClick={() => handleEmployeeToggle(emp.id, !selectedEmployees.includes(emp.id))}
                >
                  <Checkbox checked={selectedEmployees.includes(emp.id)} onCheckedChange={(checked) => handleEmployeeToggle(emp.id, checked)} />
                  <span className="text-sm font-medium">
                    {emp.first_name} {emp.last_name}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{selectedEmployees.length} employee(s) selected</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={generating || !dateRange.start || !dateRange.end || selectedEmployees.length === 0} className="bg-blue-600 hover:bg-blue-700">
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Generate Reports
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
