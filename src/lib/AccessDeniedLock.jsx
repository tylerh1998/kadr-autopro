import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { ShieldAlert, LogOut, ExternalLink, User } from 'lucide-react';

export default function AccessDeniedLock() {
  const { user, employee, logout } = useAuth();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4 transition-colors">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6 text-center">
        
        {/* Shield Icon Badge */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Header & Subtitle */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Access Restricted
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Your account does not currently have permission to access the AutoPro application (<code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-400 font-mono text-xs">autopro_access_lvl = no_access</code>).
          </p>
        </div>

        {/* User Account Info Details */}
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 text-left space-y-2.5 text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-700/60 font-semibold uppercase tracking-wider text-[10px]">
            <User className="w-3.5 h-3.5" />
            Account Details
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 dark:text-slate-400">Name:</span>
            <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
              {employee?.full_name || user?.user_metadata?.full_name || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 dark:text-slate-400">Email:</span>
            <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
              {employee?.email || user?.email || 'N/A'}
            </span>
          </div>
          {employee?.employee_id && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Employee ID:</span>
              <span className="font-mono text-slate-900 dark:text-slate-100">
                {employee.employee_id}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-slate-500 dark:text-slate-400">Access Level:</span>
            <span className="font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-semibold text-[11px]">
              {employee?.autopro_access_lvl || 'no_access'}
            </span>
          </div>
        </div>

        {/* Guidance Text */}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          If you require access to AutoPro, please contact your system administrator or manager to update your permission level.
        </p>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={logout}
            variant="outline"
            className="w-full justify-center gap-2 border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>

          <a 
            href="https://my.kensauto.ca"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            myKADR Account
          </a>
        </div>

      </div>
    </div>
  );
}
