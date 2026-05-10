import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';

export default function HistoryCard({ record, onClick, formatDateTime }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <Card className="hover:border-blue-300 hover:shadow-md transition-all">
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-slate-900 uppercase">{record.change_type}</span>
              <span className="text-sm text-slate-500">•</span>
              <span className="text-sm text-slate-600">{formatDateTime(record.changed_at)}</span>
            </div>
            <p className="text-sm text-slate-600 truncate">{record.changed_by_display || 'System'}</p>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 pointer-events-none">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>
    </button>
  );
}