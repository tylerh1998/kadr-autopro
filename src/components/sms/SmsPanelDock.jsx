import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, MessageSquare, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import SmsPanel from './SmsPanel';

// Hard ceiling on how many panels can sit in the visible row, regardless of
// how much horizontal room is available. The responsive width-fit below can
// only ever reduce this number, never exceed it.
const MAX_VISIBLE_PANELS = 4;

const GAP_PX = 12; // matches the flex `gap-3` on the dock row
const EDGE_MARGIN_PX = 24; // `right-4` (16px) + a little breathing room
const OVERFLOW_BTN_WIDTH_PX = 88; // the ▲ button is twice SmsPanel's header height-ish width
const OVERFLOW_BTN_PX = OVERFLOW_BTN_WIDTH_PX + GAP_PX; // width reserved for the ▲ button + its gap
const DEFAULT_PANEL_WIDTH = 350; // SmsPanel's own default width

/**
 * Decide which panels render in the visible row and which collapse into the
 * overflow menu. Panels are ordered oldest -> newest; the newest always wins a
 * visible slot, older ones drop into overflow first.
 */
function splitPanels(panels, viewportWidth) {
  if (panels.length <= 1) return { visible: panels, overflow: [] };

  const fit = (reserveButton) => {
    const budget = viewportWidth - EDGE_MARGIN_PX - (reserveButton ? OVERFLOW_BTN_PX : 0);
    let used = 0;
    let count = 0;
    for (let i = panels.length - 1; i >= 0; i -= 1) {
      if (count >= MAX_VISIBLE_PANELS) break;
      const w = panels[i].width || DEFAULT_PANEL_WIDTH;
      const nextUsed = used + w + (count > 0 ? GAP_PX : 0);
      if (count > 0 && nextUsed > budget) break; // always keep the newest panel
      used = nextUsed;
      count += 1;
    }
    return Math.max(1, count);
  };

  // First pass ignores the ▲ button; if that already overflows, re-fit with
  // room reserved for the button so it never covers a panel.
  let count = fit(false);
  if (count < panels.length) count = fit(true);

  const splitAt = panels.length - count;
  return { visible: panels.slice(splitAt), overflow: panels.slice(0, splitAt) };
}

export default function SmsPanelDock({ panels, setPanels }) {
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1920
  );
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [unreadPhones, setUnreadPhones] = useState(() => new Set());

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { visible, overflow } = useMemo(
    () => splitPanels(panels, viewportWidth),
    [panels, viewportWidth]
  );

  const visibleKey = visible.map((p) => p.phone).join('|');
  const overflowKey = overflow.map((p) => p.phone).join('|');

  // Keep a ref of the currently-overflowed phones so the global SMS listener
  // (registered once) can tell whether an incoming message belongs to a hidden
  // conversation.
  const overflowPhonesRef = useRef(new Set());
  useEffect(() => {
    overflowPhonesRef.current = new Set(overflowKey ? overflowKey.split('|') : []);
  }, [overflowKey]);

  useEffect(() => {
    const handleNewSms = (e) => {
      const record = e.detail?.record;
      if (!record) return;
      const candidates = [record.from_phone, record.to_phone].filter(Boolean);
      const hit = candidates.find((ph) => overflowPhonesRef.current.has(ph));
      if (hit) {
        setUnreadPhones((prev) => (prev.has(hit) ? prev : new Set(prev).add(hit)));
      }
    };
    window.addEventListener('new-sms-received', handleNewSms);
    return () => window.removeEventListener('new-sms-received', handleNewSms);
  }, []);

  // Once a conversation is back in the visible row, it is no longer "unread".
  useEffect(() => {
    setUnreadPhones((prev) => {
      if (prev.size === 0) return prev;
      const visibleSet = new Set(visibleKey ? visibleKey.split('|') : []);
      let changed = false;
      const next = new Set();
      prev.forEach((ph) => {
        if (visibleSet.has(ph)) changed = true;
        else next.add(ph);
      });
      return changed ? next : prev;
    });
  }, [visibleKey]);

  useEffect(() => {
    if (overflow.length === 0 && overflowOpen) setOverflowOpen(false);
  }, [overflow.length, overflowOpen]);

  if (panels.length === 0) return null;

  const updatePanel = (phone, patch) => {
    setPanels((prev) => prev.map((p) => (p.phone === phone ? { ...p, ...patch } : p)));
  };

  const closePanel = (phone) => {
    setPanels((prev) => prev.filter((p) => p.phone !== phone));
  };

  const maximizePanel = (phone) => {
    setPanels((prev) => prev.filter((p) => p.phone !== phone));
    window.dispatchEvent(new CustomEvent('open-sms-chat', { detail: { phone } }));
  };

  // Bring an overflowed conversation back into the visible row by moving it to
  // the newest position; the width-fit then demotes whatever no longer fits.
  const promotePanel = (phone) => {
    setPanels((prev) => {
      const target = prev.find((p) => p.phone === phone);
      if (!target) return prev;
      return [...prev.filter((p) => p.phone !== phone), { ...target, isMinimized: false }];
    });
    setOverflowOpen(false);
  };

  const anyOverflowUnread = overflow.some((p) => unreadPhones.has(p.phone));

  return (
    <DialogPrimitive.Root open modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed bottom-0 right-4 flex items-end gap-3 z-[9999] pointer-events-none focus:outline-none"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <style>{`
            @keyframes sms-dock-pulse {
              0%, 100% { background-color: #2563eb; }
              50% { background-color: #ef4444; }
            }
            .sms-dock-pulse { animation: sms-dock-pulse 2s infinite; color: #fff; }
          `}</style>

          {overflow.length > 0 && (
            <div className="pointer-events-auto">
              <DropdownMenu open={overflowOpen} onOpenChange={setOverflowOpen} modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title={`${overflow.length} more conversation${overflow.length > 1 ? 's' : ''}`}
                    className={`flex flex-col items-center justify-center w-[88px] h-12 rounded-t-xl shadow-xl select-none transition-colors text-white ${
                      anyOverflowUnread
                        ? 'sms-dock-pulse'
                        : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800'
                    }`}
                  >
                    <ChevronUp className="w-4 h-4" />
                    <span className="text-[11px] font-bold leading-none mt-0.5">{overflow.length}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="w-64 max-h-[60vh] overflow-y-auto z-[10000]"
                >
                  <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Open conversations
                  </div>
                  <DropdownMenuSeparator />
                  {overflow.map((p) => (
                    <DropdownMenuItem
                      key={p.phone}
                      onSelect={() => promotePanel(p.phone)}
                      className="flex items-center gap-2"
                    >
                      <MessageSquare className="w-4 h-4 shrink-0 text-slate-400" />
                      <span className="truncate flex-1">{p.customerName || p.phone}</span>
                      {unreadPhones.has(p.phone) && (
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      )}
                      <button
                        type="button"
                        title="Close conversation"
                        className="shrink-0 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          closePanel(p.phone);
                        }}
                      >
                        <X className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {panels.map((panel) => {
            const isVisible = visible.some((v) => v.phone === panel.phone);
            return (
              <div
                key={panel.phone}
                className={isVisible ? 'pointer-events-auto' : 'hidden'}
              >
                <SmsPanel
                  phone={panel.phone}
                  customerName={panel.customerName}
                  customerId={panel.customerId}
                  isMinimized={panel.isMinimized}
                  onResize={(width) => {
                    setPanels((prev) => {
                      const current = prev.find((p) => p.phone === panel.phone);
                      if (!current || current.width === width) return prev;
                      return prev.map((p) =>
                        p.phone === panel.phone ? { ...p, width } : p
                      );
                    });
                  }}
                  onMinimize={(minimized) => updatePanel(panel.phone, { isMinimized: minimized })}
                  onClose={() => closePanel(panel.phone)}
                  onMaximize={() => maximizePanel(panel.phone)}
                />
              </div>
            );
          })}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
