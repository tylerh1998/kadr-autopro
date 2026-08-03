import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CreditCard, DollarSign, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { checkEntityLock } from '../utils/mountainTimeUtils';

export default function ReceiveCreditModal({ open, onClose, returnItem, onUpdate }) {
  const { employee } = useAuth();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [glAccount, setGlAccount] = useState('');
  const [refundCreditTo, setRefundCreditTo] = useState('Supplier AP');
  const [toAccount, setToAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [linesOfCredit, setLinesOfCredit] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    setCurrentUser(employee);
  }, [employee]);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('Loading credit modal data...');

        const { data: accountsData, error: accountsError } = await supabase
          .from('ChartOfAccount')
          .select('*')
          .order('account_number');
        if (accountsError) throw accountsError;
        console.log('Chart of accounts loaded:', accountsData);
        setAccounts(accountsData || []);

        const { data: linesOfCreditData, error: locError } = await supabase
          .from('LinesOfCredit')
          .select('*')
          .eq('is_active', true);
        if (locError) console.error('Failed to load Lines of Credit:', locError);
        console.log('Lines of Credit loaded:', linesOfCreditData);
        setLinesOfCredit(linesOfCreditData || []);

        // Load inventory suppliers
        const { data: suppliersData, error: suppliersError } = await supabase
          .from('Supplier')
          .select('*')
          .eq('inventory_supplier', true);
        if (suppliersError) console.error('Failed to load inventory suppliers:', suppliersError);
        console.log('Inventory suppliers loaded:', suppliersData);
        setSuppliers(suppliersData || []);

        // Set default supplier after suppliers are loaded
        if (returnItem?.supplier && refundCreditTo === 'Supplier AP') {
          console.log('Setting default supplier to:', returnItem.supplier);
          setToAccount(returnItem.supplier);
        }

      } catch (error) {
        console.error("Failed to load account data:", error);
        alert('Error loading credit modal data. Please try again.');
      }
    };

    if (open) {
      setInvoiceNumber('');
      setInvoiceDate(format(new Date(), 'yyyy-MM-dd'));
      setAdjustmentAmount(0);
      setAdjustmentReason('');
      setGlAccount('5004');
      setRefundCreditTo('Supplier AP');
      setToAccount('');
      setIsAdjustmentOpen(false);
      loadData();
    }
  }, [open, returnItem]);

  useEffect(() => {
    // When refund type changes, reset toAccount appropriately
    if (refundCreditTo === 'Supplier AP' && returnItem?.supplier && suppliers.length > 0) {
      console.log('Refund type changed to Supplier AP, setting supplier:', returnItem.supplier);
      setToAccount(returnItem.supplier);
    } else if (refundCreditTo !== 'Supplier AP') {
      setToAccount('');
    }
  }, [refundCreditTo, suppliers]);

  const subtotal = returnItem?.total_cost || 0;
  const gst = Math.round(subtotal * 0.05 * 100) / 100;
  const adj = parseFloat(adjustmentAmount) || 0;
  const adjGst = Math.round(adj * 0.05 * 100) / 100;
  const adjTotal = Math.round((adj + adjGst) * 100) / 100;
  const grandTotal = Math.round((subtotal + gst + adj + adjGst) * 100) / 100;

  const displaySubtotal = Math.round((subtotal + adj) * 100) / 100;
  const displayGst = Math.round((gst + adjGst) * 100) / 100;

  const getToAccountOptions = () => {
    switch (refundCreditTo) {
      case 'Supplier AP':
        return suppliers.map(s => ({ value: s.id, label: s.name }));
      case 'Cash Drawer':
        return ['Cash', 'Cheque', 'Card', 'Etransfer'].map(o => ({ value: o, label: o }));
      case 'Line of Credit':
        return linesOfCredit.map(loc => ({ value: loc.id, label: loc.name }));
      default:
        return [];
    }
  };

  const createGLTransaction = async (transactionData) => {
    const userDisplay = currentUser?.full_name || currentUser?.email || currentUser?.id;
    const now = new Date().toISOString();

    return await supabase.from('GLTransaction').insert([{
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      ...transactionData,
      created_date: now,
      updated_date: now,
      created_by: userDisplay,
      created_by_id: currentUser?.id,
      updated_by: userDisplay
    }]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validate current user is available
    if (!currentUser) {
      alert('User not authenticated. Please log in again.');
      setLoading(false);
      return;
    }

    // Validation for To Account
    if (!toAccount) {
      alert('Please select a To Account.');
      setLoading(false);
      return;
    }

    // Validation for adjustment GL Account
    if (adj !== 0 && !glAccount) {
      alert('Please select a GL Account for the adjustment.');
      setLoading(false);
      return;
    }

    // Check if the selected supplier is locked (live check on submit)
    try {
      const supplierIdToCheck = refundCreditTo === 'Supplier AP' ? toAccount : returnItem.supplier;
      const { data: supplierMatches } = await supabase.from('Supplier').select('*').eq('id', supplierIdToCheck);
      const supplierEntity = (supplierMatches || [])[0];

      const lockStatus = checkEntityLock(supplierEntity, currentUser.email);
      if (lockStatus.isLocked) {
        alert(`This supplier is currently locked by ${lockStatus.lockedByUser}. Please wait until the lock is released.`);
        setLoading(false);
        return;
      }

      // Check if Line of Credit is locked (if selected)
      if (refundCreditTo === 'Line of Credit' && toAccount) {
        const { data: locEntity } = await supabase.from('LinesOfCredit').select('*').eq('id', toAccount).single();
        const locLockStatus = checkEntityLock(locEntity, currentUser.email);
        if (locLockStatus.isLocked) {
          alert(`This line of credit account is currently locked by ${locLockStatus.lockedByUser}. Please wait until the lock is released.`);
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('Error checking locks:', error);
      alert('Failed to check lock status. Please try again.');
      setLoading(false);
      return;
    }

    try {
      // 1. Create SupplierInvoiceLine for the parts credit
      const creditLineDescription = `ReturnPart/x${returnItem.quantity_returned}/${returnItem.part_number}`;
      const supplierIdForInvoice = refundCreditTo === 'Supplier AP' ? toAccount : returnItem.supplier;
      const invoiceLineNow = new Date().toISOString();

      await supabase.from('SupplierInvoiceLine').insert([{
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        supplier_id: supplierIdForInvoice,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        description: creditLineDescription,
        purchase_amount: Math.round(-subtotal * 100) / 100,
        gst_amount: Math.round(-gst * 100) / 100,
        gl_account: '1200',
        inventory: true,
        inventory_credit: true,
        inventory_item_id: returnItem.inventory_item_id || '',
        paid_amount: 0,
        created_date: invoiceLineNow,
        updated_date: invoiceLineNow
      }]);

      // 2. Create SupplierInvoiceLine for adjustment (if any)
      if (adj !== 0) {
        const adjustmentDescription = `Adjustment: ${adjustmentReason || 'Miscellaneous'}`;
        // Invert adj and adjGst because a negative adjustment in UI means we want to REDUCE the credit invoice total (absolute value).
        // Since credit invoice lines are negative, adding a POSITIVE amount reduces the magnitude of the credit.
        // e.g. -100 (part) + 10 (adjustment) = -90 (total credit).
        const adjustmentLineNow = new Date().toISOString();
        await supabase.from('SupplierInvoiceLine').insert([{
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          supplier_id: supplierIdForInvoice,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          description: adjustmentDescription,
          purchase_amount: Math.round(-adj * 100) / 100,
          gst_amount: Math.round(-adjGst * 100) / 100,
          gl_account: glAccount,
          inventory: false,
          paid_amount: 0,
          created_date: adjustmentLineNow,
          updated_date: adjustmentLineNow
        }]);
      }

      // 3. Create InventoryAuditLog record for credit received
      const { error: auditError } = await supabase.from('InventoryAuditLog').insert([{
        inventory_item_id: returnItem.inventory_item_id,
        part_num: returnItem.part_number,
        source_record_id: returnItem.id,
        source_function: 'ReceiveCreditModal',
        tx_type: "Credit Received",
        quantity_change: 0,
        supplier_inv: invoiceNumber,
        description: `Credit received for return of ${returnItem.quantity_returned} units. Invoice: ${invoiceNumber}`,
        created_by_id: currentUser?.id || null,
        created_by: currentUser?.full_name || currentUser?.email || currentUser?.username || null,
        tx_date: new Date().toISOString()
      }]);
      if (auditError) console.error('Error creating InventoryAuditLog:', auditError);

      // 4. Post GL transactions based on refund destination
      const glDescription = `Inventory Return Credit: ${returnItem.part_number} (Inv: ${invoiceNumber})`;

      // Credit Inventory (1200) for subtotal (parts cost ONLY)
      await createGLTransaction({
        transaction_date: invoiceDate,
        account_number: '1200',
        description: glDescription,
        debit_amount: 0,
        credit_amount: subtotal,
        reference: `Credit: ${invoiceNumber}`,
        source_type: 'inventory_return_credit',
        source_id: returnItem.id
      });

      // Credit GST Paid (2003) for the GST portion of the main return item
      if (gst !== 0) {
        await createGLTransaction({
          transaction_date: invoiceDate,
          account_number: '2003',
          description: glDescription,
          debit_amount: 0,
          credit_amount: gst,
          reference: `Credit: ${invoiceNumber}`,
          source_type: 'inventory_return_credit',
          source_id: returnItem.id
        });
      }

      // Handle GL entries for Adjustment if any
      if (adj !== 0) {
        const adjustmentGlDescription = `Inventory Return Adjustment: ${adjustmentReason || 'Miscellaneous'} (Inv: ${invoiceNumber})`;
        
        // Debit the selected GL account for the adjustment amount
        // If adj is negative (fee/charge), we DEBIT the expense account to balance the smaller AP Debit.
        // If adj is positive (extra credit), we CREDIT the account to balance the larger AP Debit.
        await createGLTransaction({
          transaction_date: invoiceDate,
          account_number: glAccount,
          description: adjustmentGlDescription,
          debit_amount: adj < 0 ? Math.abs(adj) : 0,
          credit_amount: adj >= 0 ? adj : 0,
          reference: `Adjustment: ${invoiceNumber}`,
          source_type: 'inventory_return_adjustment',
          source_id: returnItem.id
        });

        // Debit/Credit GST Paid (2003) for the adjustment's GST
        if (adjGst !== 0) {
          await createGLTransaction({
            transaction_date: invoiceDate,
            account_number: '2003',
            description: `Adjustment GST: ${adjustmentReason || 'Miscellaneous'} (Inv: ${invoiceNumber})`,
            debit_amount: adjGst < 0 ? Math.abs(adjGst) : 0,
            credit_amount: adjGst >= 0 ? adjGst : 0,
            reference: `Adjustment GST: ${invoiceNumber}`,
            source_type: 'inventory_return_adjustment',
            source_id: returnItem.id
          });
        }
      }

      if (refundCreditTo === 'Supplier AP') {
        // Debit: Accounts Payable (2000) for grand total
        await createGLTransaction({
          transaction_date: invoiceDate,
          account_number: '2000',
          description: glDescription,
          debit_amount: grandTotal,
          credit_amount: 0,
          reference: `Credit: ${invoiceNumber}`,
          source_type: 'inventory_return_credit',
          source_id: returnItem.id
        });

      } else if (refundCreditTo === 'Cash Drawer') {
        // Debit: Cash Drawer (1010) for grand total
        await createGLTransaction({
          transaction_date: invoiceDate,
          account_number: '1010',
          description: glDescription,
          debit_amount: grandTotal,
          credit_amount: 0,
          reference: `Credit: ${invoiceNumber}`,
          source_type: 'inventory_return_credit',
          source_id: returnItem.id
        });

        // Update BankAccount for Cash Drawer
        const { data: cashDrawerAccounts } = await supabase.from('BankAccount').select('*').eq('gl_account', '1010');
        if (cashDrawerAccounts && cashDrawerAccounts.length > 0) {
          const cashDrawer = cashDrawerAccounts[0];
          await supabase.from('BankAccount').update({
            current_balance: (parseFloat(cashDrawer.current_balance) || 0) + grandTotal,
            updated_date: new Date().toISOString()
          }).eq('id', cashDrawer.id);
        }

      } else if (refundCreditTo === 'Line of Credit') {
        const selectedLOC = linesOfCredit.find(loc => loc.id === toAccount);
        if (selectedLOC && selectedLOC.gl_account) {
          // Debit: LOC GL Account for grand total
          await createGLTransaction({
            transaction_date: invoiceDate,
            account_number: selectedLOC.gl_account,
            description: glDescription,
            debit_amount: grandTotal,
            credit_amount: 0,
            reference: `Credit: ${invoiceNumber}`,
            source_type: 'inventory_return_credit',
            source_id: returnItem.id
          });

          // Create LOC transaction and update balance
          const locTxNow = new Date().toISOString();
          const userDisplay = currentUser?.full_name || currentUser?.email || currentUser?.id;
          await supabase.from('LinesOfCreditTransaction').insert([{
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            line_of_credit_id: selectedLOC.id,
            transaction_date: invoiceDate,
            description: `Credit from supplier for return: ${returnItem.part_number}`,
            reference: `Credit Memo: ${invoiceNumber}`,
            charge_amount: 0,
            credit_amount: grandTotal,
            payment_amount: 0,
            source_type: 'inventory_return',
            source_id: returnItem.id,
            created_date: locTxNow,
            updated_date: locTxNow,
            created_by: userDisplay,
            created_by_id: currentUser?.id
          }]);

          const newBalance = (selectedLOC.current_balance || 0) - grandTotal;
          const newAvailableCredit = (selectedLOC.credit_limit || 0) - newBalance;
          await supabase.from('LinesOfCredit').update({
            current_balance: newBalance,
            available_credit: newAvailableCredit,
            updated_date: locTxNow
          }).eq('id', selectedLOC.id);
        } else {
          throw new Error('Selected Line of Credit or its GL account not found.');
        }
      }

      // 5. Delete the return item from InventoryReturn in Supabase
      const { error: deleteError } = await supabase.from('InventoryReturn').delete().eq('id', returnItem.id);
      if (deleteError) throw new Error('Failed to delete InventoryReturn record: ' + deleteError.message);

      setLoading(false);
      onUpdate();
    } catch (error) {
      console.error('Error recording credit:', error);
      alert('Failed to record credit. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col dark:bg-slate-950 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <CreditCard className="w-5 h-5" />
            Receive Credit / Refund
          </DialogTitle>
        </DialogHeader>
        {returnItem && (
          <form onSubmit={handleSubmit} className="space-y-6 py-4 overflow-y-auto flex-1">
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border dark:border-slate-800">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100">{returnItem.part_number}</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">{returnItem.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoice-number" className="dark:text-slate-300">Invoice #</Label>
                <Input
                  id="invoice-number"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice-date" className="dark:text-slate-300">Date</Label>
                <Input
                  id="invoice-date"
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="refund-credit-to" className="dark:text-slate-300">Refund/Credit To</Label>
                <Select value={refundCreditTo} onValueChange={setRefundCreditTo}>
                  <SelectTrigger className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-950 dark:border-slate-800">
                    <SelectItem value="Supplier AP" className="dark:text-slate-300 dark:focus:bg-slate-800">Supplier AP</SelectItem>
                    <SelectItem value="Cash Drawer" className="dark:text-slate-300 dark:focus:bg-slate-800">Cash Drawer</SelectItem>
                    <SelectItem value="Line of Credit" className="dark:text-slate-300 dark:focus:bg-slate-800">Line of Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-account" className="dark:text-slate-300">
                  {refundCreditTo === 'Supplier AP' ? 'Supplier' : 'To Account'}
                </Label>
                <Select
                  value={toAccount}
                  onValueChange={setToAccount}
                >
                  <SelectTrigger className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-950 dark:border-slate-800">
                    {getToAccountOptions().map(option => (
                      <SelectItem key={option.value} value={option.value} className="dark:text-slate-300 dark:focus:bg-slate-800">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Financial Summary
              </h4>
              <div className="space-y-2 text-sm dark:text-slate-300">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium dark:text-slate-200">${displaySubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST (5%):</span>
                  <span className="font-medium dark:text-slate-200">${displayGst.toFixed(2)}</span>
                </div>
                <Separator className="dark:bg-slate-800" />
                <div className="flex justify-between font-bold">
                  <span>Grand Total:</span>
                  <span className="text-lg dark:text-slate-100">${grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Collapsible Adjustment Section */}
            <Collapsible open={isAdjustmentOpen} onOpenChange={setIsAdjustmentOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full flex items-center justify-between dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <span className="font-semibold">Adjustment (Optional)</span>
                  {isAdjustmentOpen ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 animate-in fade-in-50 duration-200">
                <div className="space-y-4 border dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="adjustment-amount" className="dark:text-slate-300">Amount</Label>
                      <Input
                        id="adjustment-amount"
                        type="number"
                        step="0.01"
                        value={adjustmentAmount}
                        onChange={e => setAdjustmentAmount(e.target.value)}
                        placeholder="0.00"
                        className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gl-account" className="dark:text-slate-300">GL Account *</Label>
                      <Select value={glAccount} onValueChange={setGlAccount}>
                        <SelectTrigger className={(adj !== 0 && !glAccount ? 'border-red-300' : '') + " dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"}>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-950 dark:border-slate-800">
                          {accounts.filter(account => !account.controlled || account.account_number === '5004').map(account => (
                            <SelectItem key={account.id} value={account.account_number} className="dark:text-slate-300 dark:focus:bg-slate-800">
                              {account.account_number} - {account.account_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {adj !== 0 && (
                    <div className="bg-white dark:bg-slate-950 border dark:border-slate-800 rounded-lg p-3 space-y-1 text-sm dark:text-slate-300">
                      <div className="flex justify-between">
                        <span>Adjustment Amount:</span>
                        <span className={`font-medium ${adj >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          ${adj.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST (5%):</span>
                        <span className={`font-medium ${adj >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          ${adjGst.toFixed(2)}
                        </span>
                      </div>
                      <Separator className="my-2 dark:bg-slate-800" />
                      <div className="flex justify-between font-bold">
                        <span>Adjustment Total:</span>
                        <span className={adj >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          ${adjTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="adjustment-reason" className="dark:text-slate-300">Reason</Label>
                    <Textarea
                      id="adjustment-reason"
                      value={adjustmentReason}
                      onChange={e => setAdjustmentReason(e.target.value)}
                      placeholder="Reason for adjustment..."
                      rows={2}
                      className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white">
                {loading ? 'Processing...' : 'Record Credit/Refund'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}