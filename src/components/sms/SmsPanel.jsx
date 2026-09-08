import React from 'react';
import { Minus, X, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SmsThread from './SmsThread';

export default function SmsPanel({ phone, customerName, isMinimized, onClose, onMinimize, onMaximize }) {
  if (!phone) return null;

  return (
    <div className={`flex flex-col bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl rounded-t-xl overflow-hidden transition-all duration-300 ease-in-out w-[350px] ${isMinimized ? 'h-10' : 'h-[450px]'}`}>
      
      {/* Header */}
      <div 
        className="h-10 bg-blue-600 dark:bg-blue-700 flex items-center justify-between px-3 shrink-0 cursor-pointer text-white"
        onClick={() => onMinimize(!isMinimized)}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <span className="font-semibold text-sm truncate">{customerName || phone}</span>
        </div>
        
        <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-6 h-6 rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 text-white"
            onClick={(e) => {
              e.stopPropagation();
              onMinimize(!isMinimized);
            }}
            title={isMinimized ? "Expand" : "Minimize"}
          >
            <Minus className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-6 h-6 rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 text-white"
            onClick={(e) => {
              e.stopPropagation();
              onMaximize();
            }}
            title="Open in Full Window"
          >
            <Maximize2 className="w-3 h-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-6 h-6 rounded-md hover:bg-red-500 hover:text-white text-white"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      {!isMinimized && (
        <div className="flex-1 overflow-hidden">
          <SmsThread phone={phone} customerName={customerName} />
        </div>
      )}
    </div>
  );
}
