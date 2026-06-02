import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  CreditCard,
  Banknote,
  Calendar,
  Upload,
  RefreshCw,
  ArrowLeftRight,
  AlertCircle,
  History
} from "lucide-react";
import { format } from "date-fns";
import PaymentSelectionModal from '../components/cash-drawer/PaymentSelectionModal';
import DepositModal from '../components/cash-drawer/DepositModal';
import CashDrawerAdjustmentModal from '../components/cash-drawer/CashDrawerAdjustmentModal';
import DepositHistoryModal from '../components/cash-drawer/DepositHistoryModal';
import DepositSlipBreakdownModal from '../components/cash-drawer/DepositSlipBreakdownModal';
import ChangePaymentMethodModal from '../components/cash-drawer/ChangePaymentMethodModal';
import { checkFiscalPeriodStatus } from '../components/utils/fiscalPeriodUtils';
import { base44 } from '@/api/base44Client';

const paymentMethods = ['cash', 'debit', 'credit_card', 'cheque', 'e_transfer', 'other'];

const displayMethods = [
  { id: 'cash', label: 'Cash', methods: ['cash'] },
  { id: 'cards', label: 'Cards (Debit & Credit)', methods: ['credit_card', 'debit'] },
  { id: 'cheque', label: 'Cheque', methods: ['cheque'] },
  { id: 'e_transfer', label: 'E-Transfer', methods: ['e_transfer'] },
  { id: 'other', label: 'Other', methods: ['other'] }
];
const CASH_DRAWER_GL_ACCOUNT = '1010'; // Cash Drawer GL Account

export default function CashDrawerPage() {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [cashDrawerItems, setCashDrawerItems] = useState({});
  const [forDepositItems, setForDepositItems] = useState({});
  const [adjustments, setAdjustments] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showDepositHistoryModal, setShowDepositHistoryModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [modalType, setModalType] = useState(''); // 'cash_drawer' or 'for_deposit'
  const [loading, setLoading] = useState(true);
  const [showDepositSlipModal, setShowDepositSlipModal] = useState(false);
  const [depositSlipData, setDepositSlipData] = useState(null);
  const [currentDepositBatchId, setCurrentDepositBatchId] = useState(null);
  const [currentBankTransactionId, setCurrentBankTransactionId] = useState(null);
  const [existingBreakdown, setExistingBreakdown] = useState(null);
  const [showChangeMethodModal, setShowChangeMethodModal] = useState(false);
  const [paymentToChange, setPaymentToChange] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
        console.log('Loading cash drawer data');

        // Load non-deposited payments directly from Supabase via base44 edge function
        const allPaymentsRes = await base44.functions.invoke('supabaseCustomerPayments', { 
            action: 'filter', 
            match: { deposited: false } 
        });
        const paymentsData = allPaymentsRes?.data?.data || [];
        console.log('Filtered payments for cash drawer:', paymentsData);

        // Load non-deposited adjustments directly
        const adjustmentsData = await base44.entities.CashDrawerAdjustment.filter({ deposited: false });
        console.log('Filtered adjustments for cash drawer:', adjustmentsData);

        // Fetch Bank Accounts via existing backend proxy
        const bankAccountsResponse = await base44.functions.invoke('SupabaseProxy', {
          action: 'list',
          table: 'BankAccount'
        });
        const bankAccountsData = (bankAccountsResponse?.data?.data || []).filter(acc => acc.is_active !== false);
        
        // Load recent adjustments (last 10 for the modal history)
        const recentAdjustments = await base44.entities.CashDrawerAdjustment.list('-created_date', 10);

        setBankAccounts(bankAccountsData || []);
        setAdjustments(recentAdjustments);

        // Initialize cash drawer with both payments and adjustments
        const initialCashDrawer = {};
        paymentMethods.forEach(method => {
          initialCashDrawer[method] = [];
        });

        // Add CustomerPayments to cash drawer
        paymentsData.forEach(payment => {
          let customerName = 'Unknown Customer';
          if (payment.customer) {
            if (payment.customer.org_name && payment.customer.org_name.trim() !== '') {
              customerName = payment.customer.org_name;
            } else if (payment.customer.first_name || payment.customer.last_name) {
              customerName = `${payment.customer.first_name || ''} ${payment.customer.last_name || ''}`.trim();
            }
          }

          const method = payment.payment_method;
          if (initialCashDrawer[method]) {
            initialCashDrawer[method].push({
              id: `payment-${payment.id}`,
              source_type: 'payment',
              customerPaymentId: payment.id,
              amount: payment.amount || 0,
              method: method,
              date: payment.payment_date,
              workOrderNumber: payment.invoice_number || 'N/A',
              workOrderId: payment.work_order_id || null,
              customerName: customerName,
              reference: payment.reference || '',
              notes: payment.notes || '',
              cheque_name: payment.cheque_name || '',
              cheque_number: payment.cheque_number || ''
            });
          }
        });

        // Add CashDrawerAdjustments to cash drawer
        adjustmentsData.forEach(adjustment => {
          const method = adjustment.payment_method;
          if (initialCashDrawer[method]) {
            initialCashDrawer[method].push({
              id: `adjustment-${adjustment.id}`,
              source_type: 'adjustment',
              adjustmentId: adjustment.id,
              amount: adjustment.amount || 0,
              method: method,
              date: adjustment.adjustment_date,
              workOrderNumber: adjustment.reference || 'ADJ',
              customerName: adjustment.type === 'shortage' ? 'Cash Shortage' : 'Cash Overage',
              reference: adjustment.reference || '',
              notes: adjustment.description || ''
            });
          }
        });

        setCashDrawerItems(initialCashDrawer);

        // Initialize for deposit as empty
        const initialForDeposit = {};
        paymentMethods.forEach(method => {
          initialForDeposit[method] = [];
        });
        setForDepositItems(initialForDeposit);

    } catch (error) {
        console.error('Error loading cash drawer data:', error);
    } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getCashDrawerTotal = (method) => {
    return (cashDrawerItems[method] || []).reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const getForDepositTotal = (method) => {
    return (forDepositItems[method] || []).reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const getTotalForDeposit = () => {
    return paymentMethods.reduce((sum, method) => sum + getForDepositTotal(method), 0);
  };

  // Validate deposit batch based on business rules
  const isDepositBatchValid = () => {
    const methodsInBatch = new Set();
    
    paymentMethods.forEach(method => {
      if (forDepositItems[method] && forDepositItems[method].length > 0) {
        methodsInBatch.add(method);
      }
    });

    if (methodsInBatch.size === 0) {
      return { valid: false, message: 'No items selected for deposit.' };
    }

    if (methodsInBatch.size === 1) {
      return { valid: true, message: '' };
    }

    if (methodsInBatch.size === 2 && methodsInBatch.has('cash') && methodsInBatch.has('cheque')) {
      return { valid: true, message: '' };
    }

    if (methodsInBatch.size === 2 && methodsInBatch.has('credit_card') && methodsInBatch.has('debit')) {
      return { valid: true, message: '' };
    }

    const methodList = Array.from(methodsInBatch).map(m => m.replace('_', ' ')).join(', ');
    return { 
      valid: false, 
      message: `Cannot deposit multiple payment methods together (${methodList}). Only Cash and Cheque can be combined, or Debit and Credit Cards.` 
    };
  };

  const [modalPaymentMethods, setModalPaymentMethods] = useState([]);

  const handleOpenPaymentModal = (displayMethodId, type, methods) => {
    setSelectedPaymentMethod(displayMethodId);
    setModalPaymentMethods(methods);
    setModalType(type);
    setShowPaymentModal(true);
  };

  const handleMovePayments = (selectedPaymentIds) => {
    const sourceItems = modalType === 'cash_drawer' ? cashDrawerItems : forDepositItems;
    const newCashDrawerItems = { ...cashDrawerItems };
    const newForDepositItems = { ...forDepositItems };

    modalPaymentMethods.forEach(method => {
      const currentSourceList = modalType === 'cash_drawer' ? newCashDrawerItems[method] : newForDepositItems[method];
      const currentTargetList = modalType === 'cash_drawer' ? newForDepositItems[method] : newCashDrawerItems[method];

      const itemsToMove = currentSourceList.filter(item => selectedPaymentIds.includes(item.id));
      const remainingItems = currentSourceList.filter(item => !selectedPaymentIds.includes(item.id));

      if (itemsToMove.length > 0) {
        if (modalType === 'cash_drawer') {
          newCashDrawerItems[method] = remainingItems;
          newForDepositItems[method] = [...(currentTargetList || []), ...itemsToMove];
        } else {
          newForDepositItems[method] = remainingItems;
          newCashDrawerItems[method] = [...(currentTargetList || []), ...itemsToMove];
        }
      }
    });

    setCashDrawerItems(newCashDrawerItems);
    setForDepositItems(newForDepositItems);
    setShowPaymentModal(false);
  };

  const handleMakeDeposit = async (depositData) => {
    try {
      const batchValidation = isDepositBatchValid();
      if (!batchValidation.valid) {
        alert(batchValidation.message);
        return;
      }

      const totalAmount = getTotalForDeposit();

      if (totalAmount === 0) {
        alert('No payments selected for deposit.');
        return;
      }

      const selectedBankAccount = bankAccounts.find(acc => acc.id === depositData.bankAccountId);

      if (!selectedBankAccount) {
        alert('Selected bank account not found.');
        return;
      }

      const depositBatchId = `DEP-${Date.now()}`;
      const allItemsForDeposit = Object.values(forDepositItems).flat();

      const paymentsToDeposit = allItemsForDeposit.filter(item => item.source_type === 'payment');
      const adjustmentsToDeposit = allItemsForDeposit.filter(item => item.source_type === 'adjustment');

      // Update each CustomerPayment
      for (const item of paymentsToDeposit) {
        await base44.functions.invoke('supabaseCustomerPayments', {
          action: 'update',
          id: item.customerPaymentId,
          data: {
            deposited: true,
            deposit_date: depositData.depositDate,
            deposit_batch_id: depositBatchId
          }
        });
      }

      // Update each CashDrawerAdjustment
      for (const item of adjustmentsToDeposit) {
        await base44.entities.CashDrawerAdjustment.update(item.adjustmentId, {
          deposited: true,
          deposit_date: depositData.depositDate,
          deposit_batch_id: depositBatchId,
          status: 'deposited'
        });
      }

      // GL Transactions
      await base44.entities.GLTransaction.create({
        account_number: String(CASH_DRAWER_GL_ACCOUNT),
        transaction_date: depositData.depositDate,
        description: `Cash Drawer Deposit`,
        reference: depositBatchId,
        debit_amount: 0,
        credit_amount: totalAmount,
        source_type: 'deposit',
        source_id: null
      });

      await base44.entities.GLTransaction.create({
        account_number: String(selectedBankAccount.gl_account || '1000'),
        transaction_date: depositData.depositDate,
        description: `Cash Drawer Deposit`,
        reference: depositBatchId,
        debit_amount: totalAmount,
        credit_amount: 0,
        source_type: 'deposit',
        source_id: selectedBankAccount.id
      });

      const activeMethods = paymentMethods.filter(method => 
        forDepositItems[method] && forDepositItems[method].length > 0
      );
      
      const formatMethodNameForDescription = (method) => {
        if (method === 'cash') return 'Cash';
        if (method === 'cheque') return 'Cheques';
        if (method === 'credit_card') return 'Credit Cards';
        if (method === 'debit') return 'Debit';
        if (method === 'e_transfer') return 'E-Transfers';
        if (method === 'other') return 'Other';
        return method.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      };

      const descriptionParts = activeMethods.map(formatMethodNameForDescription);
      const depositDescription = descriptionParts.length > 0 
        ? `Deposit - ${descriptionParts.join(' & ')}`
        : `Deposit`;

      const newTransactionId = `btx-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;

      const bankTransactionResponse = await base44.functions.invoke('SupabaseProxy', {
        action: 'create',
        table: 'BankTransaction',
        data: {
          id: newTransactionId,
          bank_account_id: selectedBankAccount.id,
          transaction_date: depositData.depositDate,
          description: depositDescription,
          reference: '',
          credit_amount: totalAmount,
          debit_amount: 0,
          source_type: 'deposit',
          source_id: depositBatchId,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString()
        }
      });

      const bankTransactionError = bankTransactionResponse?.data?.error;
      if (bankTransactionError) {
        throw new Error(bankTransactionError);
      }

      const bankTransaction = Array.isArray(bankTransactionResponse?.data?.data)
        ? bankTransactionResponse.data.data[0]
        : bankTransactionResponse?.data?.data;

      const hasCashOrCheques = (forDepositItems.cash?.length > 0) || (forDepositItems.cheque?.length > 0);

      if (hasCashOrCheques) {
        setDepositSlipData({
          forDepositItems: { ...forDepositItems },
          selectedBankAccount,
          depositDate: depositData.depositDate,
          totalAmount
        });
        setCurrentDepositBatchId(depositBatchId);
        setCurrentBankTransactionId(bankTransaction?.id || newTransactionId);
        setExistingBreakdown(null);
        setShowDepositModal(false);
        setShowDepositSlipModal(true);
      } else {
        alert('Deposit processed successfully!');
        setShowDepositModal(false);
      }

      const emptyForDeposit = {};
      paymentMethods.forEach(method => {
        emptyForDeposit[method] = [];
      });
      setForDepositItems(emptyForDeposit);

      loadData();

    } catch (error) {
      console.error('Error processing deposit:', error);
      alert('Failed to process deposit.');
    }
  };

  const handleRecordAdjustment = async (adjustmentData) => {
    try {
      const periodStatus = await checkFiscalPeriodStatus(adjustmentData.adjustmentDate);
      if (periodStatus === 'closed') {
        alert('Cannot record adjustment. The fiscal period for this date is closed.');
        return;
      }
      if (periodStatus === 'none') {
        alert('Cannot record adjustment. No fiscal period exists for this date. Please create a fiscal period first.');
        return;
      }

      const amount = parseFloat(adjustmentData.amount);
      if (isNaN(amount) || amount === 0) {
        alert('Invalid adjustment amount.');
        return;
      }

      const adjustedAmount = adjustmentData.type === 'shortage' ? -Math.abs(amount) : Math.abs(amount);
      const reference = adjustmentData.reference || `ADJ-${Date.now()}`;
      const glTransactionIds = [];

      const cashDrawerGL = await base44.entities.GLTransaction.create({
        account_number: CASH_DRAWER_GL_ACCOUNT,
        transaction_date: adjustmentData.adjustmentDate,
        description: `Cash Drawer Adjustment - ${adjustmentData.description}`,
        reference: reference,
        debit_amount: adjustedAmount > 0 ? adjustedAmount : 0,
        credit_amount: adjustedAmount < 0 ? Math.abs(adjustedAmount) : 0,
        source_type: 'adjustment',
        source_id: null
      });
      glTransactionIds.push(cashDrawerGL.id);

      const adjustmentGL = await base44.entities.GLTransaction.create({
        account_number: adjustmentData.glAccount,
        transaction_date: adjustmentData.adjustmentDate,
        description: `Cash Drawer Adjustment - ${adjustmentData.description}`,
        reference: reference,
        debit_amount: adjustedAmount < 0 ? Math.abs(adjustedAmount) : 0,
        credit_amount: adjustedAmount > 0 ? adjustedAmount : 0,
        source_type: 'adjustment',
        source_id: null
      });
      glTransactionIds.push(adjustmentGL.id);

      const adjustmentRecord = await base44.entities.CashDrawerAdjustment.create({
        adjustment_date: adjustmentData.adjustmentDate,
        amount: adjustedAmount,
        type: adjustmentData.type,
        payment_method: adjustmentData.paymentMethod,
        description: adjustmentData.description,
        reference: reference,
        gl_transactions: JSON.stringify(glTransactionIds),
        status: 'posted_to_gl',
        deposited: false
      });

      await base44.entities.GLTransaction.update(cashDrawerGL.id, { source_id: adjustmentRecord.id });
      await base44.entities.GLTransaction.update(adjustmentGL.id, { source_id: adjustmentRecord.id });

      alert(`Cash drawer adjustment recorded successfully!\nReference: ${reference}`);
      
      setShowAdjustmentModal(false);
      loadData();

    } catch (error) {
      console.error('Error recording adjustment:', error);
      alert(`Failed to record adjustment: ${error.message || 'Unknown error'}`);
    }
  };

  const getPaymentIcon = (method) => {
    switch (method) {
      case 'cash': return <DollarSign className="w-5 h-5 text-green-600" />;
      case 'credit_card': return <CreditCard className="w-5 h-5 text-blue-600" />;
      case 'debit': return <CreditCard className="w-5 h-5 text-purple-600" />;
      case 'cards': return <CreditCard className="w-5 h-5 text-blue-600" />;
      case 'cheque': return <Banknote className="w-5 h-5 text-orange-600" />;
      case 'e_transfer': return <ArrowLeftRight className="w-5 h-5 text-indigo-600" />;
      case 'other': return <DollarSign className="w-5 h-5 text-gray-600" />;
      default: return <DollarSign className="w-5 h-5 text-gray-600" />;
    }
  };

  const getDisplayGroupCashDrawerTotal = (displayGroup) => {
    return displayGroup.methods.reduce((sum, method) => sum + getCashDrawerTotal(method), 0);
  };

  const getDisplayGroupForDepositTotal = (displayGroup) => {
    return displayGroup.methods.reduce((sum, method) => sum + getForDepositTotal(method), 0);
  };

  const getDisplayGroupItemCount = (displayGroup, type) => {
    const itemsObj = type === 'cash_drawer' ? cashDrawerItems : forDepositItems;
    return displayGroup.methods.reduce((count, method) => count + (itemsObj[method] || []).length, 0);
  };

  const depositBatchStatus = isDepositBatchValid();

  const handleReprintDepositSlip = async (deposit) => {
    try {
      setLoading(true);
      const selectedBankAccount = bankAccounts.find(acc => acc.id === deposit.bank_account_id);
      const batchId = deposit.source_id || deposit.reference;
      
      const existingBreakdowns = await base44.entities.DepositSlipBreakdown.filter({ deposit_batch_id: batchId });
      const savedBreakdown = existingBreakdowns.length > 0 ? existingBreakdowns[0] : null;

      if (savedBreakdown) {
        let savedCheques = [];
        try {
          savedCheques = JSON.parse(savedBreakdown.cheques_data || '[]');
        } catch (e) {
          console.error('Error parsing saved cheques data:', e);
        }

        const reconstructedForDeposit = {};
        paymentMethods.forEach(method => {
          reconstructedForDeposit[method] = [];
        });

        savedCheques.forEach((cheque, index) => {
          reconstructedForDeposit.cheque.push({
            id: `saved-cheque-${index}`,
            customerName: cheque.customerName,
            amount: cheque.amount
          });
        });

        if (savedBreakdown.total_cash > 0) {
          reconstructedForDeposit.cash.push({
            id: 'saved-cash',
            amount: savedBreakdown.total_cash
          });
        }

        setDepositSlipData({
          forDepositItems: reconstructedForDeposit,
          selectedBankAccount,
          depositDate: savedBreakdown.deposit_date,
          totalAmount: savedBreakdown.deposit_amount
        });
        setExistingBreakdown(savedBreakdown);
        setCurrentDepositBatchId(null); 
        setCurrentBankTransactionId(null);
        setShowDepositHistoryModal(false);
        setShowDepositSlipModal(true);
        return;
      }

      const allPaymentsRes = await base44.functions.invoke('supabaseCustomerPayments', { 
          action: 'filter', 
          match: { deposit_batch_id: batchId } 
      });
      const batchPayments = allPaymentsRes?.data?.data || [];
      const batchAdjustments = await base44.entities.CashDrawerAdjustment.filter({ deposit_batch_id: batchId });

      const reconstructedForDeposit = {};
      paymentMethods.forEach(method => {
        reconstructedForDeposit[method] = [];
      });

      batchPayments.forEach(payment => {
        let customerName = 'Unknown Customer';
        if (payment.customer) {
          if (payment.customer.org_name && payment.customer.org_name.trim() !== '') {
            customerName = payment.customer.org_name;
          } else if (payment.customer.first_name || payment.customer.last_name) {
            customerName = `${payment.customer.first_name || ''} ${payment.customer.last_name || ''}`.trim();
          }
        }

        const method = payment.payment_method;
        if (reconstructedForDeposit[method]) {
          reconstructedForDeposit[method].push({
            id: `payment-${payment.id}`,
            source_type: 'payment',
            customerPaymentId: payment.id,
            amount: payment.amount || 0,
            method: method,
            date: payment.payment_date,
            workOrderNumber: payment.invoice_number || 'N/A',
            customerName: customerName,
            reference: payment.reference || '',
            notes: payment.notes || '',
            cheque_name: payment.cheque_name || '',
            cheque_number: payment.cheque_number || ''
          });
        }
      });

      batchAdjustments.forEach(adjustment => {
        const method = adjustment.payment_method;
        if (reconstructedForDeposit[method]) {
          reconstructedForDeposit[method].push({
            id: `adjustment-${adjustment.id}`,
            source_type: 'adjustment',
            adjustmentId: adjustment.id,
            amount: adjustment.amount || 0,
            method: method,
            date: adjustment.adjustment_date,
            workOrderNumber: adjustment.reference || 'ADJ',
            customerName: adjustment.type === 'shortage' ? 'Cash Shortage' : 'Cash Overage',
            reference: adjustment.reference || '',
            notes: adjustment.description || ''
          });
        }
      });

      setDepositSlipData({
        forDepositItems: reconstructedForDeposit,
        selectedBankAccount,
        depositDate: deposit.transaction_date,
        totalAmount: deposit.credit_amount
      });
      setExistingBreakdown(null);
      setCurrentDepositBatchId(null);
      setCurrentBankTransactionId(null);
      setShowDepositHistoryModal(false);
      setShowDepositSlipModal(true);

    } catch (error) {
      console.error('Error loading deposit data for reprint:', error);
      alert('Failed to load deposit data for reprinting.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChangeMethod = (item) => {
    setPaymentToChange(item);
    setShowChangeMethodModal(true);
  };

  const handleSavePaymentMethod = async (item, newMethod) => {
    try {
      setLoading(true);
      await base44.functions.invoke('supabaseCustomerPayments', {
        action: 'update',
        id: item.customerPaymentId,
        data: {
          payment_method: newMethod
        }
      });
      
      setShowChangeMethodModal(false);
      setPaymentToChange(null);
      setShowPaymentModal(false); 
      
      await loadData();
      alert('Payment method updated successfully.');
    } catch (error) {
      console.error('Error updating payment method:', error);
      alert('Failed to update payment method.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDepositSlip = async (slipData) => {
    try {
      const response = await base44.functions.invoke('generateDepositSlipPDF', {
        cashBreakdown: slipData.cashBreakdown,
        cheques: slipData.cheques,
        bankAccountNumber: slipData.selectedBankAccount?.account_number || '',
        bankAccountName: slipData.selectedBankAccount?.name || '',
        depositDate: slipData.depositDate,
        totalCash: slipData.totalCash,
        totalCheques: slipData.totalCheques,
        depositAmount: slipData.depositAmount
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      
      setShowDepositSlipModal(false);
      setDepositSlipData(null);
    } catch (error) {
      console.error('Error generating deposit slip:', error);
      alert('Failed to generate deposit slip. The deposit was processed successfully.');
      setShowDepositSlipModal(false);
      setDepositSlipData(null);
    }
  };

  return (
    <>
      <div className="p-6 min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Cash Drawer</h1>
              <p className="text-slate-600 mt-1">Daily cash management and deposits</p>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={loadData} variant="outline" size="icon" disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                onClick={() => setShowAdjustmentModal(true)}
                variant="outline"
                className="bg-white border-orange-300 hover:bg-orange-50"
              >
                <AlertCircle className="w-4 h-4 mr-2 text-orange-600" />
                Record Adjustment
              </Button>
              <Button
                onClick={() => setShowDepositHistoryModal(true)}
                variant="outline"
                className="bg-white border-blue-300 hover:bg-blue-50"
              >
                <History className="w-4 h-4 mr-2 text-blue-600" />
                History
              </Button>
              <div className="flex flex-col items-end gap-1">
                <Button
                  onClick={() => setShowDepositModal(true)}
                  className="bg-green-600 hover:bg-green-700 h-14 text-lg px-8 shadow-md transition-all hover:scale-105"
                  disabled={!depositBatchStatus.valid}
                >
                  <Upload className="w-6 h-6 mr-2" />
                  Make Deposit (${getTotalForDeposit().toFixed(2)})
                </Button>
                {!depositBatchStatus.valid && getTotalForDeposit() > 0 && (
                  <p className="text-xs text-red-600 max-w-xs text-right">
                    {depositBatchStatus.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Payment Methods Table */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Management</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left p-4 font-semibold text-slate-700 bg-slate-50">Payment Method</th>
                      <th className="text-center p-4 font-semibold text-blue-900 bg-blue-100">Cash Drawer</th>
                      <th className="text-center p-4 font-semibold text-green-900 bg-green-100">For Deposit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayMethods.map((displayGroup) => {
                      const cdTotal = getDisplayGroupCashDrawerTotal(displayGroup);
                      const fdTotal = getDisplayGroupForDepositTotal(displayGroup);
                      const cdCount = getDisplayGroupItemCount(displayGroup, 'cash_drawer');
                      const fdCount = getDisplayGroupItemCount(displayGroup, 'for_deposit');

                      return (
                        <tr key={displayGroup.id} className="border-b hover:bg-slate-50">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              {getPaymentIcon(displayGroup.id)}
                              <span className="font-medium capitalize">{displayGroup.label}</span>
                            </div>
                          </td>
                          <td 
                            className="p-4 text-center cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors border-r border-blue-100"
                            onClick={() => cdTotal > 0 && handleOpenPaymentModal(displayGroup.id, 'cash_drawer', displayGroup.methods)}
                          >
                            <div className={`${cdTotal > 0 ? 'text-blue-600 hover:text-blue-800' : 'text-slate-400'} font-semibold`}>
                              ${cdTotal.toFixed(2)}
                              <div className="text-xs text-gray-500">
                                ({cdCount} items)
                              </div>
                            </div>
                          </td>
                          <td 
                            className="p-4 text-center cursor-pointer bg-green-50 hover:bg-green-100 transition-colors"
                            onClick={() => fdTotal > 0 && handleOpenPaymentModal(displayGroup.id, 'for_deposit', displayGroup.methods)}
                          >
                            <div className={`${fdTotal > 0 ? 'text-green-600 hover:text-green-800' : 'text-slate-400'} font-semibold`}>
                              ${fdTotal.toFixed(2)}
                              <div className="text-xs text-gray-500">
                                ({fdCount} items)
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 font-semibold">
                      <td className="p-4 bg-gray-50">Total</td>
                      <td className="p-4 text-center text-lg bg-blue-100">
                        ${paymentMethods.reduce((sum, method) => sum + getCashDrawerTotal(method), 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-center text-lg text-green-700 bg-green-100">
                        ${getTotalForDeposit().toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading payments...</p>
            </div>
          )}
        </div>
      </div>

      <PaymentSelectionModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        paymentMethod={selectedPaymentMethod}
        payments={modalPaymentMethods.reduce((acc, method) => {
          const list = modalType === 'cash_drawer' ? (cashDrawerItems[method] || []) : (forDepositItems[method] || []);
          return [...acc, ...list];
        }, [])}
        title={modalType === 'cash_drawer' ? 'Move to For Deposit' : 'Move to Cash Drawer'}
        onMove={handleMovePayments}
        onChangeMethod={handleOpenChangeMethod}
      />

      <DepositModal
        open={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        bankAccounts={bankAccounts}
        totalAmount={getTotalForDeposit()}
        forDepositItems={forDepositItems}
        onSubmit={handleMakeDeposit}
      />

      <CashDrawerAdjustmentModal
        open={showAdjustmentModal}
        onClose={() => setShowAdjustmentModal(false)}
        onSubmit={handleRecordAdjustment}
        adjustments={adjustments}
      />

      <DepositHistoryModal
        open={showDepositHistoryModal}
        onClose={() => setShowDepositHistoryModal(false)}
        onDepositReversed={loadData}
        onReprintSlip={handleReprintDepositSlip}
      />

      <DepositSlipBreakdownModal
        open={showDepositSlipModal}
        onClose={() => {
          setShowDepositSlipModal(false);
          setDepositSlipData(null);
          setCurrentDepositBatchId(null);
          setCurrentBankTransactionId(null);
          setExistingBreakdown(null);
        }}
        forDepositItems={depositSlipData?.forDepositItems || {}}
        selectedBankAccount={depositSlipData?.selectedBankAccount}
        depositDate={depositSlipData?.depositDate}
        depositBatchId={currentDepositBatchId}
        bankTransactionId={currentBankTransactionId}
        existingBreakdown={existingBreakdown}
        onGenerateSlip={handleGenerateDepositSlip}
      />

      <ChangePaymentMethodModal
        open={showChangeMethodModal}
        onClose={() => {
          setShowChangeMethodModal(false);
          setPaymentToChange(null);
        }}
        payment={paymentToChange}
        onSave={handleSavePaymentMethod}
      />
    </>
  );
}