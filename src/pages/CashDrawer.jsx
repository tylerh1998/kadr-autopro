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
import { CustomerPayments, Customer, GLTransaction, CashDrawerAdjustment, DepositSlipBreakdown } from '@/entities/all';
import PaymentSelectionModal from '../components/cash-drawer/PaymentSelectionModal';
import DepositModal from '../components/cash-drawer/DepositModal';
import CashDrawerAdjustmentModal from '../components/cash-drawer/CashDrawerAdjustmentModal';
import DepositHistoryModal from '../components/cash-drawer/DepositHistoryModal';
import DepositSlipBreakdownModal from '../components/cash-drawer/DepositSlipBreakdownModal';
import ChangePaymentMethodModal from '../components/cash-drawer/ChangePaymentMethodModal';
import { checkFiscalPeriodStatus } from '../components/utils/fiscalPeriodUtils';
import { base44 } from '@/api/base44Client';

// 1. Import and initialize the Supabase client
import { createClient } from '@supabase/supabase-js';

// Using your exact specified environment variable names
const supabaseUrl = process.env.Supabase_project_url || '';
const supabaseKey = process.env.Supabase_Publishable_key || '';
const supabase = createClient(supabaseUrl, supabaseKey);

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
        const adjustmentsData = await CashDrawerAdjustment.filter({ deposited: false });
        console.log('Filtered adjustments for cash drawer:', adjustmentsData);

        // 2. Fetch Bank Accounts using the exact case-sensitive table name
        const { data: bankAccountsData, error: bankAccountsError } = await supabase
          .from('BankAccount')
          .select('*')
          .eq('is_active', true);

        if (bankAccountsError) {
          console.error("Error fetching bank accounts from Supabase:", bankAccountsError);
        }
        
        // Load recent adjustments (last 10 for the modal history)
        const recentAdjustments = await CashDrawerAdjustment.list('-created_date', 10);

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
        await CashDrawerAdjustment.update(item.adjustmentId, {
          deposited: true,
          deposit_date: depositData.depositDate,
          deposit_batch_id: depositBatchId,
          status: 'deposited'
        });
      }

      // GL Transactions
      await GLTransaction.create({
        account_number: CASH_DRAWER_GL_ACCOUNT,
        transaction_date: depositData.depositDate,
        description: `Cash Drawer Deposit`,
        reference: depositBatchId,
        debit_amount: 0,
        credit_amount: totalAmount,
        source_type: 'deposit',
        source_id: null
      });

      await GLTransaction.create({
        account_number: selectedBankAccount.gl_account || '1000',
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

      // 3. Create Bank Transaction directly in Supabase using correct casing
      // We must generate a text ID because the schema marks it 'text not null' without a default
      const newTransactionId = `btx-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;

      const { data: bankTransaction, error: bankTransactionError } = await supabase
        .from('BankTransaction')
        .insert([{
          id: newTransactionId, 
          bank_account_id: selectedBankAccount.id,
          transaction_date: depositData.depositDate, // Defined as text in your schema
          description: depositDescription,
          reference: '',
          credit_amount: totalAmount,
          debit_amount: 0,
          source_type: 'deposit',
          source_id: depositBatchId,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString()
        }])
        .select()
        .single();

      if (bankTransactionError) {
        console.error("Error creating bank transaction in Supabase:", bankTransactionError);
        throw new Error(bankTransactionError.message);
      }

      const hasCashOrCheques = (forDepositItems.cash?.length > 0) || (forDepositItems.cheque?.length > 0);

      if (hasCashOrCheques) {
        setDepositSlipData({
          forDepositItems: { ...forDepositItems },
          selectedBankAccount,
          depositDate: depositData.depositDate,
          totalAmount
        });
        setCurrentDepositBatchId(depositBatchId);
        setCurrentBankTransactionId(bankTransaction.id);
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

      const cashDrawerGL = await GLTransaction.create({
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

      const adjustmentGL = await GLTransaction.create({
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

      const adjustmentRecord = await CashDrawerAdjustment.create({
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

      await GLTransaction.update(cashDrawerGL.id, { source_id: adjustmentRecord.id });
      await GLTransaction.update(adjustmentGL.id, { source_id: adjustmentRecord.id });

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
      
      const existingBreakdowns = await DepositSlipBreakdown.filter({ deposit_batch_id: batchId });
      const savedBreakdown = existingBreakdowns.length > 0 ? existingBreakdowns[0] : null;

      if (savedBreakdown) {
        let savedCheques = [];
        try {
          savedCheques = JSON.parse(savedBreakdown.cheques_data || '[]');
        } catch (e) {
