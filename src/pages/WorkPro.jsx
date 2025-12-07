import React from 'react';
import { Briefcase } from 'lucide-react';

export default function WorkProPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <div className="text-center max-w-2xl">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-100 rounded-full mb-6">
          <Briefcase className="w-12 h-12 text-blue-600" />
        </div>
        <h1 className="text-4xl font-bold text-slate-800 mb-4">
          AutoPRO
        </h1>
        <p className="text-xl text-slate-600 mb-8">
          Ken's Auto Division - Repair Order Management
        </p>
        <div className="bg-white rounded-lg shadow-lg p-8 border border-slate-200">
          <p className="text-slate-700 text-lg">
            This page is under construction and will be available in the next phase.
          </p>
        </div>
      </div>
    </div>
  );
}