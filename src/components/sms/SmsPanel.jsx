import React, { useState, useEffect } from 'react';
import { Minus, X, Maximize2, SquareArrowUp, MoreHorizontal, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase';
import SmsThread from './SmsThread';
import SmsCustomerModal from './SmsCustomerModal';

export default function SmsPanel({ phone, customerName, customerId, isMinimized, onMinimize, onClose, onMaximize }) {
  const [localCustomerName, setLocalCustomerName] = useState(customerName);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [size, setSize] = useState({ width: 350, height: 450 });
  const [isResizing, setIsResizing] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  
  const [metadata, setMetadata] = useState({ category: null, is_archived: false });
  const [statuses, setStatuses] = useState([]);

  const getColorClass = (color) => {
    const map = {
      slate: 'bg-slate-500', blue: 'bg-blue-500', green: 'bg-green-500', 
      yellow: 'bg-yellow-500', orange: 'bg-orange-500', red: 'bg-red-500', 
      purple: 'bg-purple-500', pink: 'bg-pink-500'
    };
    return map[color] || 'bg-slate-500';
  };

  // Fetch initial metadata and statuses
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [metaRes, statRes] = await Promise.all([
          supabase.from('SmsConversationMetadata').select('*').eq('external_phone', phone).single(),
          supabase.from('WorkOrderStatus').select('*').order('display_order')
        ]);
        
        if (metaRes.data) setMetadata(metaRes.data);
        if (statRes.data) setStatuses(statRes.data);
      } catch (err) {
        console.error('Error fetching SMS panel data:', err);
      }
    };
    if (phone) fetchData();
  }, [phone]);

  const handleUpdateMetadata = async (updates) => {
    try {
      const { error } = await supabase
        .from('SmsConversationMetadata')
        .upsert({ external_phone: phone, ...updates });
      
      if (error) throw error;
      setMetadata(prev => ({ ...prev, ...updates }));
      
      // Dispatch an event to force SmsModal to refresh its list
      window.dispatchEvent(new CustomEvent('new-sms-received', { detail: { record: { from_phone: phone } } }));
    } catch (err) {
      console.error('Error updating SMS metadata:', err);
    }
  };

  // Keep local name in sync if parent updates it
  useEffect(() => {
    setLocalCustomerName(customerName);
  }, [customerName]);

  // Listen for new messages to trigger unread flash
  useEffect(() => {
    const handleNewSms = (e) => {
      const newMsg = e.detail?.record;
      if (newMsg && (newMsg.from_phone === phone || newMsg.to_phone === phone)) {
        if (isMinimized) {
          setHasUnread(true);
        }
      }
    };
    window.addEventListener('new-sms-received', handleNewSms);
    return () => window.removeEventListener('new-sms-received', handleNewSms);
  }, [phone, isMinimized]);

  // Clear unread when expanded
  useEffect(() => {
    if (!isMinimized) {
      setHasUnread(false);
    }
  }, [isMinimized]);

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
          {/* Top Handle */}
          <div 
            className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize z-50 hover:bg-blue-400/50" 
            onMouseDown={handleMouseDown('top')} 
          />
          {/* Top-Left Corner Handle */}
          <div 
            className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-50 hover:bg-blue-400/50" 
            onMouseDown={handleMouseDown('top-left')} 
          />
        </>
      )}

      <style>{`
        @keyframes pulse-red-blue {
          0%, 100% { background-color: #2563eb; } /* blue-600 */
          50% { background-color: #ef4444; } /* red-500 */
        }
        .animate-pulse-red-blue {
          animation: pulse-red-blue 2s infinite;
        }
      `}</style>

      {/* Header */}
      <div 
        className={`h-10 flex items-center justify-between px-3 shrink-0 text-white select-none transition-colors ${
          hasUnread ? 'animate-pulse-red-blue' : 'bg-blue-600 dark:bg-blue-700'
        }`}
      >
        <div 
          className="flex items-center gap-2 overflow-hidden flex-1 cursor-pointer hover:bg-blue-700 dark:hover:bg-blue-600 px-1 -ml-1 rounded transition-colors"
          onClick={() => setShowCustomerModal(true)}
        >
          <span className="font-semibold text-sm truncate">{localCustomerName || phone}</span>
        </div>
        
        <div className="flex items-center gap-1 shrink-0 ml-2 relative z-50">
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-6 h-6 rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 text-white cursor-pointer pointer-events-auto"
            onClick={() => onMinimize(!isMinimized)}
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? <SquareArrowUp className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-6 h-6 rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 text-white cursor-pointer pointer-events-auto"
            onClick={() => onMaximize()}
            title="Open in Full Window"
          >
            <Maximize2 className="w-3 h-3" />
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 text-white cursor-pointer pointer-events-auto outline-none transition-colors" title="More Options">
              <MoreHorizontal className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 z-[10000]">
              <DropdownMenuItem onClick={() => handleUpdateMetadata({ is_archived: !metadata.is_archived })}>
                {metadata.is_archived ? 'Unarchive' : 'Archive'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled className="font-semibold text-xs text-slate-500">Categories</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleUpdateMetadata({ category: null })}>
                {metadata.category == null ? <Check className="w-4 h-4 mr-2" /> : <div className="w-4 h-4 mr-2" />}
                None
              </DropdownMenuItem>
              {statuses.map(status => (
                <DropdownMenuItem 
                  key={status.id}
                  onClick={() => handleUpdateMetadata({ category: status.name })}
                >
                  {metadata.category === status.name ? <Check className="w-4 h-4 mr-2" /> : <div className="w-4 h-4 mr-2" />}
                  <div className={`w-3 h-3 rounded-full mr-2 ${getColorClass(status.color)}`} />
                  {status.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-6 h-6 rounded-md hover:bg-red-500 hover:text-white text-white cursor-pointer pointer-events-auto"
            onClick={() => onClose()}
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

      <SmsCustomerModal
        open={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        phone={phone}
        customerId={customerId}
        onCustomerSaved={(newCustomer) => {
          setLocalCustomerName(`${newCustomer.first_name || ''} ${newCustomer.last_name || ''}`.trim() || newCustomer.org_name);
        }}
      />
    </div>
  );
}
