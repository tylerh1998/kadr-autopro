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
import { ChartOfAccount, InventoryTxs, LinesOfCredit, LinesOfCreditTransaction, SupplierInvoiceLine, InventoryReturn, GLTransaction, BankAccount } from '@/entities/all';

export default function ReceiveCreditModal({ open, onClose, returnItem, onUpdate }) {
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
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('Loading credit modal data...');

        const accountsData = await ChartOfAccount.list('account_number');
        console.log('Chart of accounts loaded:', accountsData);
        setAccounts(accountsData);

        let linesOfCreditData = [];
        try {
          linesOfCreditData = await LinesOfCredit.filter({ is_active: true });
          console.log('Lines of Credit loaded via filter:', linesOfCreditData);
        } catch (filterError) {
          console.log('Filter failed, trying list():', filterError);
          try {
            linesOfCreditData = await LinesOfCredit.list();
            console.log('Lines of Credit loaded via list:', linesOfCreditData);
            linesOfCreditData = linesOfCreditData.filter(loc => loc.is_active !== false);
          } catch (listError) {
            console.error('Both filter and list failed for Lines of Credit:', listError);
          }
        }
        setLinesOfCredit(linesOfCreditData);

      } catch (error) {
        console.error("Failed to load account data:", error);
        alert('Error loading credit modal data. Please try again.');
      }
    };

    if (open) {
      loadData();
      setInvoiceNumber('');
      setInvoiceDate(format(new Date(), 'yyyy-MM-dd'));
      setAdjustmentAmount(0);
      setAdjustmentReason('');
      setGlAccount('5004'); // Default to Inventory Price Adjustment account
      setRefundCreditTo('Supplier AP');
      setToAccount('');
      setIsAdjustmentOpen(false);
    }
  }, [open]);

  useEffect(() => {
    setToAccount('');
  }, [refundCreditTo]);

  const subtotal = returnItem?.total_cost || 0;
  const gst = subtotal * 0.05;
  const adj = parseFloat(adjustmentAmount) || 0;
  const adjGst = adj * 0.05;
  const adjTotal = adj + adjGst;
  const grandTotal = subtotal + gst + adj + adjGst;

  const getToAccountOptions = () => {
    switch (refundCreditTo) {
      case 'Cash Drawer':
        return ['Cash', 'Cheque', 'Card', 'Etransfer'].map(o => ({ value: o, label: o }));
      case 'Line of Credit':
        return linesOfCredit.map(loc => ({ value: loc.id, label: loc.name }));
      default:
        return [];
    }
  };

  const isToAccountDisabled = refundCreditTo === 'Supplier AP';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validation for To Account when required
    if (!isToAccountDisabled && !toAccount) {
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

    try {
      // 1. Create SupplierInvoiceLine for the parts credit
      const creditLineDescription = `ReturnPart/x${returnItem.quantity_returned}/${returnItem.part_number}`;
      await SupplierInvoiceLine.create({
        supplier_id: returnItem.supplier,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        description: creditLineDescription,
        purchase_amount: -subtotal,
        gst_amount: -gst,
        gl_account: '1200',
        inventory: true
      });

      // 2. Create SupplierInvoiceLine for adjustment (if any)
      if (adj !== 0) {
        const adjustmentDescription = `Adjustment: ${adjustmentReason || 'Miscellaneous'}`;
        await SupplierInvoiceLine.create({
          supplier_id: returnItem.supplier,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          description: adjustmentDescription,
          purchase_amount: adj,
          gst_amount: adjGst,
          gl_account: glAccount,
          inventory: false
        });
      }

      // 3. Create inventory transaction for credit received
      await InventoryTxs.create({
        inventory_item_id: returnItem.inventory_item_id,
        ro_number: "",
        part_num: returnItem.part_number,
        tx_date: new Date().toISOString(),
        tx_type: "Credit Received",
        quantity_change: 0,
        quantity_ordered_change: 0,
        supplier_name: returnItem.supplier || '',
        source_record_id: returnItem.id,
        description: `Credit received for return of ${returnItem.quantity_returned} units. Invoice: ${invoiceNumber}`
      });

      // 4. Post GL transactions based on refund destination
      const glDescription = `Inventory Return Credit: ${returnItem.part_number} (Inv: ${invoiceNumber})`;

      // Credit Inventory (1200) for subtotal (parts cost ONLY)
      await GLTransaction.create({
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
        await GLTransaction.create({
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
        await GLTransaction.create({
          transaction_date: invoiceDate,
          account_number: glAccount,
          description: adjustmentGlDescription,
          debit_amount: adj >= 0 ? adj : 0,
          credit_amount: adj < 0 ? Math.abs(adj) : 0,
          reference: `Adjustment: ${invoiceNumber}`,
          source_type: 'inventory_return_adjustment',
          source_id: returnItem.id
        });

        // Debit/Credit GST Paid (2003) for the adjustment's GST
        if (adjGst !== 0) {
          await GLTransaction.create({
            transaction_date: invoiceDate,
            account_number: '2003',
            description: `Adjustment GST: ${adjustmentReason || 'Miscellaneous'} (Inv: ${invoiceNumber})`,
            debit_amount: adjGst >= 0 ? adjGst : 0,
            credit_amount: adjGst < 0 ? Math.abs(adjGst) : 0,
            reference: `Adjustment GST: ${invoiceNumber}`,
            source_type: 'inventory_return_adjustment',
            source_id: returnItem.id
          });
        }
      }

      if (refundCreditTo === 'Supplier AP') {
        // Debit: Accounts Payable (2000) for grand total
        await GLTransaction.create({
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
        await GLTransaction.create({
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
        const cashDrawerAccounts = await BankAccount.filter({ gl_account: '1010' });
        if (cashDrawerAccounts && cashDrawerAccounts.length > 0) {
          const cashDrawer = cashDrawerAccounts[0];
          await BankAccount.update(cashDrawer.id, {
            current_balance: (cashDrawer.current_balance || 0) + grandTotal
          });
        }

      } else if (refundCreditTo === 'Line of Credit') {
        const selectedLOC = linesOfCredit.find(loc => loc.id === toAccount);
        if (selectedLOC && selectedLOC.gl_account) {
          // Debit: LOC GL Account for grand total
          await GLTransaction.create({
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
          await LinesOfCreditTransaction.create({
            line_of_credit_id: selectedLOC.id,
            transaction_date: invoiceDate,
            description: `Credit from supplier for return: ${returnItem.part_number}`,
            reference: `Credit Memo: ${invoiceNumber}`,
            charge_amount: 0,
            credit_amount: grandTotal,
            source_type: 'inventory_return',
            source_id: returnItem.id,
          });

          const newBalance = (selectedLOC.current_balance || 0) - grandTotal;
          const newAvailableCredit = (selectedLOC.credit_limit || 0) - newBalance;
          await LinesOfCredit.update(selectedLOC.id, {
            current_balance: newBalance,
            available_credit: newAvailableCredit,
          });
        } else {
          throw new Error('Selected Line of Credit or its GL account not found.');
        }
      }

      // 5. Delete the return item from InventoryReturn
      await InventoryReturn.delete(returnItem.id);

      alert("Credit/Refund information has been recorded and logged.");
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
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Receive Credit / Refund
          </DialogTitle>
        </DialogHeader>
        {returnItem && (
          <form onSubmit={handleSubmit} className="space-y-6 py-4 overflow-y-auto flex-1">
            <div className="bg-slate-50 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-900">{returnItem.part_number}</h4>
              <p className="text-sm text-slate-600">{returnItem.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoice-number">Invoice #</Label>
                <Input
                  id="invoice-number"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice-date">Date</Label>
                <Input
                  id="invoice-date"
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="refund-credit-to">Refund/Credit To</Label>
                <Select value={refundCreditTo} onValueChange={setRefundCreditTo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Supplier AP">Supplier AP</SelectItem>
                    <SelectItem value="Cash Drawer">Cash Drawer</SelectItem>
                    <SelectItem value="Line of Credit">Line of Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-account">To Account</Label>
                <Select
                  value={toAccount}
                  onValueChange={setToAccount}
                  disabled={isToAccountDisabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isToAccountDisabled ? "N/A (Supplier AP)" : "Select account"} />
                  </SelectTrigger>
                  <SelectContent>
                    {getToAccountOptions().map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Financial Summary
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST (5%):</span>
                  <span className="font-medium">${gst.toFixed(2)}</span>
                </div>
                {adj !== 0 && (
                  <>
                    <div className="flex justify-between">
                      <span>Adjustment:</span>
                      <span className={`font-medium ${adj >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${adj.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Adjustment GST:</span>
                      <span className={`font-medium ${adj >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${adjGst.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Grand Total:</span>
                  <span className="text-lg">${grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Collapsible Adjustment Section */}
            <Collapsible open={isAdjustmentOpen} onOpenChange={setIsAdjustmentOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full flex items-center justify-between"
                >
                  <span className="font-semibold">Adjustment (Optional)</span>
                  {isAdjustmentOpen ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="adjustment-amount">Amount</Label>
                      <Input
                        id="adjustment-amount"
                        type="number"
                        step="0.01"
                        value={adjustmentAmount}
                        onChange={e => setAdjustmentAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gl-account">GL Account *</Label>
                      <Select value={glAccount} onValueChange={setGlAccount}>
                        <SelectTrigger className={adj !== 0 && !glAccount ? 'border-red-300' : ''}>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.filter(account => !account.controlled || account.account_number === '5004').map(account => (
                            <SelectItem key={account.id} value={account.account_number}>
                              {account.account_number} - {account.account_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {adj !== 0 && (
                    <div className="bg-white border rounded-lg p-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Adjustment Amount:</span>
                        <span className={`font-medium ${adj >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${adj.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST (5%):</span>
                        <span className={`font-medium ${adj >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${adjGst.toFixed(2)}
                        </span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-bold">
                        <span>Adjustment Total:</span>
                        <span className={adj >= 0 ? 'text-green-600' : 'text-red-600'}>
                          ${adjTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="adjustment-reason">Reason</Label>
                    <Textarea
                      id="adjustment-reason"
                      value={adjustmentReason}
                      onChange={e => setAdjustmentReason(e.target.value)}
                      placeholder="Reason for adjustment..."
                      rows={2}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
                {loading ? 'Processing...' : 'Record Credit/Refund'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}