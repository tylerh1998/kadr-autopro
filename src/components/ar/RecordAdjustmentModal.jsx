import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ChartOfAccount } from '@/entities/all';
import { checkFiscalPeriodStatus } from '@/components/utils/fiscalPeriodUtils';
import { AlertTriangle } from 'lucide-react';

// Helper function to format date for input field (MM/DD/YYYY)
const formatDateForInput = (date) => {
  if (!date) return '';
  try {
    return format(date, 'MM/dd/yyyy');
  } catch (error) {
    console.error('Date formatting error:', error);
    return '';
  }
};

// Helper function to parse and validate date input with autofill
const parseAndValidateDateInput = (inputDate) => {
  if (!inputDate || inputDate.trim() === '') return { valid: false, date: null, error: 'Date is required' };
  
  const trimmed = inputDate.trim();
  let month, day, year;
  
  try {
    const parts = trimmed.split('/');
    
    if (parts.length === 2) {
      // MM/DD format - autofill current year
      month = parts[0];
      day = parts[1];
      year = new Date().getFullYear().toString();
    } else if (parts.length === 3) {
      // MM/DD/YY or MM/DD/YYYY format
      month = parts[0];
      day = parts[1];
      year = parts[2];
      
      // Convert 2-digit year to 4-digit
      if (year.length === 2) {
        const currentYear = new Date().getFullYear();
        const currentCentury = Math.floor(currentYear / 100) * 100;
        const twoDigitYear = parseInt(year);
        year = (currentCentury + twoDigitYear > currentYear + 10) ? (currentCentury - 100 + twoDigitYear).toString() : (currentCentury + twoDigitYear).toString();
      }
    } else {
      return { valid: false, date: null, error: 'Invalid date format. Use MM/DD or MM/DD/YYYY' };
    }
    
    // Pad month and day
    month = month.padStart(2, '0');
    day = day.padStart(2, '0');
    
    // Validate numeric values
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);
    const yearNum = parseInt(year);
    
    if (isNaN(monthNum) || isNaN(dayNum) || isNaN(yearNum)) {
      return { valid: false, date: null, error: 'Date must contain valid numbers' };
    }
    
    if (monthNum < 1 || monthNum > 12) {
      return { valid: false, date: null, error: 'Month must be between 1 and 12' };
    }
    
    if (dayNum < 1 || dayNum > 31) {
      return { valid: false, date: null, error: 'Day must be between 1 and 31' };
    }
    
    if (year.length !== 4 || yearNum < 1900 || yearNum > 2100) {
      return { valid: false, date: null, error: 'Year must be a valid 4-digit year' };
    }
    
    // Create date and validate it's a real date
    const isoDate = `${year}-${month}-${day}`;
    const testDate = new Date(isoDate + 'T00:00:00');
    
    if (isNaN(testDate.getTime())) {
      return { valid: false, date: null, error: 'Invalid date' };
    }
    
    // Verify the date components match
    if (testDate.getFullYear() !== yearNum || 
        testDate.getMonth() + 1 !== monthNum || 
        testDate.getDate() !== dayNum) {
      return { valid: false, date: null, error: 'Invalid date' };
    }
    
    return { valid: true, date: testDate, error: null }; // Return Date object
  } catch (error) {
    return { valid: false, date: null, error: 'Error parsing date' };
  }
};

export default function RecordAdjustmentModal({ open, onClose, customer, onRecordAdjustment }) {
  const [adjustmentDate, setAdjustmentDate] = useState(new Date());
  const [dateInputValue, setDateInputValue] = useState(formatDateForInput(new Date()));
  const [dateInputError, setDateInputError] = useState(null);
  const [amount, setAmount] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('charge');
  const [glAccount, setGlAccount] = useState('4010');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [glAccounts, setGlAccounts] = useState([]);
  const [periodError, setPeriodError] = useState('');

  useEffect(() => {
    if (open) {
      loadGLAccounts();
      checkPeriodStatus(adjustmentDate);
    }
  }, [open]);

  useEffect(() => {
    if (open && adjustmentDate) {
      checkPeriodStatus(adjustmentDate);
    }
  }, [adjustmentDate, open]);

  const loadGLAccounts = async () => {
    try {
      const accounts = await ChartOfAccount.filter({ is_active: true }, 'account_number');
      setGlAccounts(accounts.filter(acc => !acc.controlled));
    } catch (error) {
      console.error('Error loading GL accounts:', error);
      setGlAccounts([]);
    }
  };

  const checkPeriodStatus = async (date) => {
    try {
      const status = await checkFiscalPeriodStatus(format(date, 'yyyy-MM-dd'));
      if (!status.isValid) {
        setPeriodError(status.message);
      } else {
        setPeriodError('');
      }
    } catch (error) {
      console.error('Error checking fiscal period:', error);
      setPeriodError('Error checking fiscal period status.');
    }
  };

  const handleDateBlur = () => {
    const result = parseAndValidateDateInput(dateInputValue);
    if (result.valid) {
      setAdjustmentDate(result.date);
      setDateInputError(null);
      // Format it nicely back to input
      setDateInputValue(formatDateForInput(result.date));
    } else {
      setDateInputError(result.error);
    }
  };

  const handleCalendarSelect = (date) => {
    if (date) {
      setAdjustmentDate(date);
      setDateInputValue(formatDateForInput(date));
      setDateInputError(null);
    }
  };

  const handleSubmit = () => {
    if (periodError || dateInputError) {
      alert('Cannot record adjustment: Please fix date errors.');
      return;
    }

    const adjustmentAmount = parseFloat(amount);
    
    if (isNaN(adjustmentAmount) || adjustmentAmount === 0) {
      alert('Please enter a valid adjustment amount.');
      return;
    }
    
    if (!description.trim()) {
      alert('Please enter a description for the adjustment.');
      return;
    }

    const finalAmount = adjustmentType === 'credit' ? -Math.abs(adjustmentAmount) : Math.abs(adjustmentAmount);

    const adjustmentData = {
      customer_id: customer.id,
      adjustment_date: format(adjustmentDate, 'yyyy-MM-dd'),
      amount: finalAmount,
      gl_account: glAccount,
      description: description.trim(),
      reference: reference.trim(),
    };
    
    onRecordAdjustment(adjustmentData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record A/R Adjustment for {customer.first_name} {customer.last_name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Adjustment Date</Label>
            <div className="flex items-center gap-2">
              <Input
                value={dateInputValue}
                onChange={(e) => {
                  setDateInputValue(e.target.value);
                  setDateInputError(null);
                }}
                onBlur={handleDateBlur}
                placeholder="MM/DD/YYYY"
                className={dateInputError ? 'border-red-500 dark:border-red-700' : ''}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10 shrink-0">
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar 
                    mode="single" 
                    selected={adjustmentDate} 
                    onSelect={handleCalendarSelect} 
                    initialFocus 
                  />
                </PopoverContent>
              </Popover>
            </div>
            {dateInputError && <p className="text-xs text-red-500">{dateInputError}</p>}
            {periodError && !dateInputError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-900/50 rounded-md mt-2">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800 dark:text-red-400">{periodError}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="charge">Charge (+)</SelectItem>
                  <SelectItem value="credit">Credit (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>GL Account</Label>
            <Select value={glAccount} onValueChange={setGlAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Select GL Account..." />
              </SelectTrigger>
              <SelectContent>
                {glAccounts.map(account => (
                  <SelectItem key={account.id} value={account.account_number}>
                    {account.account_number} - {account.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Reason for adjustment..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Reference (Optional)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Reference number, ticket #, etc."
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!!periodError}>
            <FileText className="w-4 h-4 mr-2" />
            Record Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}