import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const colourOptions = [
  { value: 'white', label: 'White', swatch: 'bg-white border-slate-300' },
  { value: 'blue', label: 'Blue', swatch: 'bg-blue-100 border-blue-200' },
  { value: 'green', label: 'Green', swatch: 'bg-green-100 border-green-200' },
  { value: 'yellow', label: 'Yellow', swatch: 'bg-yellow-100 border-yellow-200' },
  { value: 'pink', label: 'Pink', swatch: 'bg-pink-100 border-pink-200' }
];

export default function NoteColorPicker({ icon: Icon, currentColour = 'white', onSelect, buttonClassName = '', buttonIconClassName = '' }) {
  const [open, setOpen] = useState(false);

  const handleSelect = async (colour) => {
    await onSelect?.(colour);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors cursor-pointer ${buttonClassName}`} title="Colour">
          <Icon className={`h-4 w-4 ${buttonIconClassName}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Choose Colour</div>
        <div className="space-y-1">
          {colourOptions.map((option) => {
            const isActive = currentColour === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <div className="flex items-center gap-3">
                  <span className={`h-5 w-5 rounded-full border ${option.swatch}`} />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{option.label}</span>
                </div>
                {isActive ? <Check className="h-4 w-4 text-slate-500 dark:text-slate-400" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}