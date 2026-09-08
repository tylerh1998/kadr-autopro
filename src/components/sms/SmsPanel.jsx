import React, { useState } from 'react';
import { Minus, X, Maximize2, SquareArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SmsThread from './SmsThread';

export default function SmsPanel({ phone, customerName, isMinimized, onClose, onMinimize, onMaximize }) {
  const [size, setSize] = useState({ width: 350, height: 450 });
  const [isResizing, setIsResizing] = useState(false);

  if (!phone) return null;

  const handleMouseDown = (direction) => (e) => {
    // Only allow resize if not minimized
    if (isMinimized) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;

    const handleMouseMove = (moveEvent) => {
      let newWidth = startWidth;
      let newHeight = startHeight;

      // Because the panel is fixed at the bottom-right:
      // Dragging left means clientX decreases, so width increases.
      if (direction.includes('left')) {
        newWidth = startWidth + (startX - moveEvent.clientX);
      }
      // Dragging top means clientY decreases, so height increases.
      if (direction.includes('top')) {
        newHeight = startHeight + (startY - moveEvent.clientY);
      }

      // Enforce min and max limits
      newWidth = Math.max(250, Math.min(newWidth, 800));
      newHeight = Math.max(200, Math.min(newHeight, 1000));

      setSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsResizing(false);
    };

    setIsResizing(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      className={`relative flex flex-col bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl rounded-t-xl overflow-hidden ${!isResizing ? 'transition-all duration-300 ease-in-out' : ''}`}
      style={{ 
        width: `${size.width}px`, 
        height: isMinimized ? '42px' : `${size.height}px` 
      }}
    >
      
      {/* Resizer Handles (Hidden when minimized) */}
      {!isMinimized && (
        <>
          {/* Top Handle */}
          <div 
            className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize z-50 hover:bg-blue-400/50" 
            onMouseDown={handleMouseDown('top')} 
          />
          {/* Left Handle */}
          <div 
            className="absolute top-0 left-0 bottom-0 w-1.5 cursor-ew-resize z-50 hover:bg-blue-400/50" 
            onMouseDown={handleMouseDown('left')} 
          />
          {/* Top-Left Corner Handle */}
          <div 
            className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-50 hover:bg-blue-400/50" 
            onMouseDown={handleMouseDown('top-left')} 
          />
        </>
      )}

      {/* Header */}
      <div 
        className="h-10 bg-blue-600 dark:bg-blue-700 flex items-center justify-between px-3 shrink-0 cursor-pointer text-white select-none"
        onClick={() => onMinimize(!isMinimized)}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <span className="font-semibold text-sm truncate">{customerName || phone}</span>
        </div>
        
        <div className="flex items-center gap-1 shrink-0 ml-2">
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
            {isMinimized ? <SquareArrowUp className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
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

      {/* Invisible overlay during resize to catch mouse events over iframes/inputs */}
      {isResizing && (
        <div className="fixed inset-0 z-[100] cursor-grabbing" />
      )}
    </div>
  );
}
