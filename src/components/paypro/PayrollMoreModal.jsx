import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronRight, MoreHorizontal, Landmark, FileText, BarChart3, TrendingUp, Settings } from 'lucide-react';
import { createPageUrl } from '@/utils';

const MORE_OPTIONS = [
  {
    name: 'Remittances',
    description: 'Generate and review payroll remittances',
    icon: Landmark,
    path: 'paypro/Remittances',
  },
  {
    name: 'T4s',
    description: 'Generate T4s and CRA XML files',
    icon: FileText,
    path: 'paypro/T4s',
  },
  {
    name: 'Reports',
    description: 'Payroll summary and tax reports',
    icon: BarChart3,
    path: 'paypro/Reports',
  },
  {
    name: 'Trends',
    description: 'Payroll trends and year-over-year comparisons',
    icon: TrendingUp,
    path: 'paypro/Trends',
  },
  {
    name: 'Setup',
    description: 'Payroll constants and settings',
    icon: Settings,
    path: 'paypro/Setup',
  },
];

export default function PayrollMoreModal({ open, onClose }) {
  const handleOptionClick = (option) => {
    window.location.href = createPageUrl(option.path);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MoreHorizontal className="w-5 h-5" />
            More Payroll
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {MORE_OPTIONS.map((option) => (
            <div
              key={option.name}
              onClick={() => handleOptionClick(option)}
              className="flex justify-between items-center p-4 border rounded-lg cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:border-slate-700"
            >
              <div className="flex items-center gap-3">
                <option.icon className="w-4 h-4" />
                <div>
                  <span className="font-medium">{option.name}</span>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{option.description}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5" />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
