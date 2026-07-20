import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ModalCloseButton({ onClick, className = '' }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className={`no-print absolute right-4 top-4 z-10 h-11 w-11 bg-red-600 p-0 text-white shadow-sm hover:bg-red-700 ${className}`.trim()}
    >
      <X className="h-5 w-5" />
      <span className="sr-only">Close</span>
    </Button>
  );
}