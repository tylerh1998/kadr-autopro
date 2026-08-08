import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Shield, Upload } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import DatabaseQueryTool from '@/components/admin/DatabaseQueryTool';

export default function AdminPage() {
  const { employee } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (employee?.admin === true) {
      setIsAdmin(true);
    }
    setLoading(false);
  }, [employee]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <h1 className="text-2xl font-bold text-slate-700 dark:text-slate-300">Access Denied</h1>
          <p className="text-slate-500 mt-2 dark:text-slate-400">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 rounded-lg shadow-sm">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Admin</h1>
            <p className="text-slate-500 dark:text-slate-400">Administrative tools.</p>
          </div>
        </div>
        <Button
          onClick={() => window.location.href = createPageUrl('LankarImport')}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Upload className="w-4 h-4 mr-2" />
          Lankar Import
        </Button>
      </div>

      <DatabaseQueryTool />
    </div>
  );
}
