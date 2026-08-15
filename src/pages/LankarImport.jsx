import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText } from 'lucide-react';
import { createPageUrl } from '@/utils';
import LegacyWorkOrderImportModal from '@/components/lankar/LegacyWorkOrderImportModal';

export default function LankarImport() {
  const [showWorkOrderImportModal, setShowWorkOrderImportModal] = useState(false);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => window.location.href = createPageUrl('Setup')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Setup
        </Button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Lankar Import</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Import legacy Lankar work orders</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowWorkOrderImportModal(true)}
              variant="outline"
              className="border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/30"
            >
              <FileText className="w-4 h-4 mr-2" />
              Import Work Order
            </Button>
          </div>
        </div>
      </div>

      <LegacyWorkOrderImportModal
        open={showWorkOrderImportModal}
        onClose={() => setShowWorkOrderImportModal(false)}
      />
    </div>
  );
}
