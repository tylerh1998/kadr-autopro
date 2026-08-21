import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

export default function ValidationNotices({ notices }) {
  if (!notices || notices.length === 0) return null;

  return (
    <div className="space-y-3">
      {notices.map((notice, index) => (
        <Alert key={index} variant="destructive" className="bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-900">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <AlertDescription className="text-red-800 dark:text-red-300">
            <div className="font-semibold mb-1">{notice.title}</div>
            <div className="text-sm">{notice.message}</div>
            {notice.details && notice.details.length > 0 && (
              <ul className="mt-2 ml-4 list-disc text-sm space-y-1">
                {notice.details.map((detail, i) => (
                  <li key={i}>{detail}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
