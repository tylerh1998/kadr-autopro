import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

export default function PaymentSelectionModal({ open, onClose, paymentMethod, payments, title, onMove }) {
  const [selectedPayments, setSelectedPayments] = useState([]);

  const handleSelectAll = () => {
    setSelectedPayments(payments.map(p => p.id));
  };

  const handleUnselectAll = () => {
    setSelectedPayments([]);
  };

  const handleTogglePayment = (paymentId) => {
    setSelectedPayments(prev => 
      prev.includes(paymentId) 
        ? prev.filter(id => id !== paymentId)
        : [...prev, paymentId]
    );
  };

  const handleMove = () => {
    onMove(selectedPayments);
    setSelectedPayments([]);
  };

  const selectedTotal = payments
    .filter(p => selectedPayments.includes(p.id))
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const getAdjustmentBadge = (item) => {
    if (item.source_type !== 'adjustment') return null;
    
    const isShortage = item.amount < 0;
    
    return (
      <Badge 
        className={`${
          isShortage 
            ? 'bg-red-100 text-red-800 border-red-300' 
            : 'bg-green-100 text-green-800 border-green-300'
        } border`}
      >
        {isShortage ? (
          <>
            <TrendingDown className="w-3 h-3 mr-1" />
            Shortage
          </>
        ) : (
          <>
            <TrendingUp className="w-3 h-3 mr-1" />
            Overage
          </>
        )}
      </Badge>
    );
  };

  // Helper to safely format YYYY-MM-DD dates without timezone shifts
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      // If it looks like YYYY-MM-DD, parse manually to avoid UTC conversion
      if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
      }
      // Fallback for other formats
      return new Date(dateStr).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title} - {paymentMethod?.replace('_', ' ')?.toUpperCase()}
            <Badge variant="outline">{payments.length} items</Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={handleUnselectAll}>
            Unselect All
          </Button>
        </div>

        <div className="flex-grow overflow-y-auto border rounded-md">
          {payments.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No items in this category
            </div>
          ) : (
            <div className="divide-y">
              {payments.map((payment) => {
                const isAdjustment = payment.source_type === 'adjustment';
                const isNegative = payment.amount < 0;
                const isShortage = isAdjustment && isNegative;
                
                return (
                  <div 
                    key={payment.id} 
                    onClick={() => handleTogglePayment(payment.id)}
                    className={`p-4 flex items-center gap-3 cursor-pointer transition-colors ${
                      selectedPayments.includes(payment.id) 
                        ? 'bg-blue-50 border-l-4 border-l-blue-500' 
                        : 'hover:bg-gray-50'
                    } ${isAdjustment ? 'bg-orange-50/30' : ''}`}
                  >
                    <Checkbox
                      checked={selectedPayments.includes(payment.id)}
                      onCheckedChange={() => handleTogglePayment(payment.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    
                    {isAdjustment && (
                      <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                        isShortage ? 'text-red-500' : 'text-green-500'
                      }`} />
                    )}
                    
                    <div className="flex-grow">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {payment.customerName || (isAdjustment ? 'Adjustment' : 'Payment')}
                        </span>
                        {getAdjustmentBadge(payment)}
                      </div>
                      {/* Show cheque info if available */}
                      {payment.method === 'cheque' && (payment.cheque_name || payment.cheque_number) && (
                        <div className="text-xs text-slate-600 mt-1">
                          {payment.cheque_name && <span>Cheque: {payment.cheque_name}</span>}
                          {payment.cheque_name && payment.cheque_number && <span> • </span>}
                          {payment.cheque_number && <span>#{payment.cheque_number}</span>}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDate(payment.date)}
                        {payment.reference && ` • Ref: ${payment.reference}`}
                      </div>
                      {payment.notes && (
                        <div className="text-xs text-gray-500 mt-1 italic">
                          {payment.notes}
                        </div>
                      )}
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <div className={`font-semibold text-lg ${
                        isNegative ? 'text-red-600' : ''
                      }`}>
                        {isNegative ? '-' : ''}${Math.abs(payment.amount).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500 capitalize">
                        {payment.method.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Selected: {selectedPayments.length} items (${selectedTotal.toFixed(2)})
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleMove}
              disabled={selectedPayments.length === 0}
            >
              Move Selected
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}