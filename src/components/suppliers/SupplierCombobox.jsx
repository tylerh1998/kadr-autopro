import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Check, Search } from 'lucide-react';

const sortSuppliers = (suppliers) => [...suppliers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));

export default function SupplierCombobox({ suppliers, currentValue, onChange, disabled, placeholder = 'Select Supplier', className = '', selectedLabel }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedItemRef = React.useRef(null);
  const listRef = React.useRef(null);

  const availableSuppliers = useMemo(() => sortSuppliers(suppliers || []), [suppliers]);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return availableSuppliers;
    return availableSuppliers.filter((supplier) => String(supplier.name || '').toLowerCase().includes(query));
  }, [availableSuppliers, search]);

  React.useEffect(() => {
    if (!open) return;

    const timeoutId = window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const listEl = listRef.current;
          const selectedEl = selectedItemRef.current;
          if (!listEl || !selectedEl) return;

          const listRect = listEl.getBoundingClientRect();
          const selectedRect = selectedEl.getBoundingClientRect();
          const targetTop = selectedRect.top - listRect.top + listEl.scrollTop - (listEl.clientHeight / 2) + (selectedEl.offsetHeight / 2);

          listEl.scrollTop = Math.max(0, targetTop);
        });
      });
    }, 30);

    return () => window.clearTimeout(timeoutId);
  }, [open, filteredSuppliers, currentValue]);

  const selectedSupplier = availableSuppliers.find((supplier) => String(supplier.id) === String(currentValue));
  const defaultSelectedLabel = selectedSupplier ? selectedSupplier.name : placeholder;
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
        <div className="p-2 bg-white dark:bg-slate-800">
          <Input
            placeholder="Search supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2"
            autoFocus
          />
          <div ref={listRef} className="max-h-[260px] overflow-y-auto space-y-1">
            {filteredSuppliers.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No suppliers found.</div>
            ) : (
              filteredSuppliers.map((supplier) => {
                const isSelected = String(currentValue) === String(supplier.id);
                return (
                  <div
                    key={supplier.id}
                    ref={isSelected ? selectedItemRef : null}
                    onClick={() => {
                      onChange(String(supplier.id));
                      setOpen(false);
                      setSearch('');
                    }}
                    className="flex items-center justify-between rounded-sm px-2 py-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-50 dark:border-slate-700 last:border-0"
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{supplier.name}</span>
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