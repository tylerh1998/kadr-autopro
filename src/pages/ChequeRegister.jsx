import React from 'react';
import IssuedChequesTable from '@/components/cheques/IssuedChequesTable';

export default function ChequeRegister() {
  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cheque Register</h1>
          <p className="text-slate-600 mt-1">View and manage issued cheques</p>
        </div>
        <IssuedChequesTable />
      </div>
    </div>
  );
}