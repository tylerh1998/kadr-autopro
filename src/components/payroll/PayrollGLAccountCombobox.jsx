import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Check, Search } from 'lucide-react';

const sortAccounts = (accounts) => [...accounts].sort((a, b) => String(a.account_number).localeCompare(String(b.account_number), undefined, { numeric: true, sensitivity: 'base' }));

export default function PayrollGLAccountCombobox({ chartOfAccounts, currentValue, onChange, disabled, placeholder = 'Select GL Account *', className = '', selectedLabel, nextElementId = 'debit' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const selectedItemRef = React.useRef(null);
  const listRef = React.useRef(null);
  const highlightedItemRef = React.useRef(null);

  const availableAccounts = useMemo(() => {
    return sortAccounts(chartOfAccounts || []);
  }, [chartOfAccounts]);

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return availableAccounts;
    return availableAccounts.filter((account) => {
      const number = String(account.account_number || '').toLowerCase();
      const name = String(account.account_name || '').toLowerCase();
      return number.includes(query) || name.includes(query);
    });
  }, [availableAccounts, search]);

  React.useEffect(() => {
    setHighlightedIndex(-1);
  }, [search]);

  React.useEffect(() => {
    if (!open) return;

    const timeoutId = window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const listEl = listRef.current;
          // Use highlighted item if navigating by keyboard, otherwise fallback to selected item
          const targetEl = highlightedItemRef.current || selectedItemRef.current;
          if (!listEl || !targetEl) return;

          const listRect = listEl.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();
          const targetTop = targetRect.top - listRect.top + listEl.scrollTop - (listEl.clientHeight / 2) + (targetEl.offsetHeight / 2);

          listEl.scrollTop = Math.max(0, targetTop);
        });
      });
    }, 30);

    return () => window.clearTimeout(timeoutId);
  }, [open, filteredAccounts, currentValue, highlightedIndex]);

  const handleKeyDown = (e) => {
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'ArrowDown' || e.key === 'Tab') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredAccounts.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const accountToSelect = highlightedIndex >= 0 ? filteredAccounts[highlightedIndex] : filteredAccounts[0];
      if (accountToSelect) {
        onChange(String(accountToSelect.account_number));
        setOpen(false);
        setSearch('');
        setTimeout(() => {
          if (nextElementId) {
             document.getElementById(nextElementId)?.focus();
          }
        }, 50);
      }
    }
  };

  const selectedAccount = availableAccounts.find((account) => String(account.account_number) === String(currentValue));
  const defaultSelectedLabel = selectedAccount ? `${selectedAccount.account_number} - ${selectedAccount.account_name}` : placeholder;
  const displayLabel = selectedLabel || defaultSelectedLabel;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={`w-full justify-between font-normal ${className}`}
        >
          <span className="truncate">{displayLabel}</span>
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="p-2 bg-white">
          <Input
            placeholder="Search by account # or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="mb-2"
            autoFocus
          />
          <div ref={listRef} className="max-h-[260px] overflow-y-auto space-y-1">
            {filteredAccounts.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">No accounts found.</div>
            ) : (
              filteredAccounts.map((account, index) => {
                const isSelected = String(currentValue) === String(account.account_number);
                const isHighlighted = index === highlightedIndex;
                
                // If it's highlighted, attach highlightedItemRef. 
                // If it's selected, attach selectedItemRef.
                const ref = isHighlighted ? highlightedItemRef : (isSelected ? selectedItemRef : null);

                return (
                  <div
                    key={account.id || account.account_number}
                    ref={ref}
                    onClick={() => {
                      onChange(String(account.account_number));
                      setOpen(false);
                      setSearch('');
                      setTimeout(() => {
                        if (nextElementId) {
                           document.getElementById(nextElementId)?.focus();
                        }
                      }, 50);
                    }}
                    className={`flex items-center justify-between rounded-sm px-2 py-2 text-sm outline-none cursor-pointer border-b border-slate-50 last:border-0 ${isHighlighted ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-slate-900">{account.account_number}</span>
                      <span className="text-xs text-slate-500 truncate">{account.account_name}</span>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-green-600 shrink-0" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}