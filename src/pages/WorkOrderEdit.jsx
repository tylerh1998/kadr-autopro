import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useWorkOrder } from '../components/hooks/useWorkOrder';
import { useShopData } from '../components/hooks/useInventory';
import { WorkOrder, Customer, Vehicle, InventoryItem, InventoryTxs, CustomerPayments, User as UserEntity, SystemSettings } from '@/entities/all';
import WorkOrderForm from '../components/work-orders/WorkOrderForm';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client'; // NEW: Added base44 import
import {
  Save,
  Printer,
  Send,
  DollarSign,
  CalendarDays,
  BarChart3,
  Eye,
  Loader2,
  FileText,
  RefreshCw,
  X,
} from 'lucide-react';


import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

// Import all necessary modals
import WorkOrderReport from '../components/work-orders/WorkOrderReport';
import SESEmailModal from '../components/work-orders/SESEmailModal';
import WorkPROModal from '../components/work-orders/WorkPROModal';
import ROInspectionModal from '../components/work-orders/ROInspectionModal';
import ROApprovalsModal from '../components/work-orders/ROApprovalsModal';
import AdvancePaymentModal from '../components/work-orders/AdvancePaymentModal';
import SchedulerViaWoModal from '../components/work-orders/SchedulerViaWoModal';
import EditApptViaWoModal from '../components/work-orders/EditApptViaWoModal';
import AppointmentsListModal from '../components/work-orders/AppointmentsListModal';
import WorkOrderProfitability from '../components/work-orders/WorkOrderProfitability';

// Import Modals for editing
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import CustomerForm from '../components/customers/CustomerForm';
import VehicleForm from '../components/vehicles/VehicleForm';
import VehicleHistoryModal from '../components/vehicles/VehicleHistoryModal';
import WorkOrderDetailsEditModal from '../components/work-orders/form/WorkOrderDetailsEditModal';

// Import the new WorkPRO modals
import WorkPROTaskModal from '../components/work-orders/WorkPROTaskModal';
import WorkPRODescriptionModal from '../components/work-orders/WorkPRODescriptionModal';
import WorkPROCommentsModal from '../components/work-orders/WorkPROCommentsModal';

// NEW import: WONotesModal & OdometerPromptModal & InvoiceDescriptionModal
import WONotesModal from '../components/work-orders/WONotesModal';
import OdometerPromptModal from '../components/work-orders/OdometerPromptModal';
import InvoiceDescriptionModal from '../components/work-orders/InvoiceDescriptionModal';
import InvoicePaymentModal from '../components/work-orders/InvoicePaymentModal';

// NEW: Import Card components for the lock message
import { Card, CardContent } from '@/components/ui/card';

export default function WorkOrderEditPage() { // Changed to WorkOrderEditPage
  const urlParams = new URLSearchParams(window.location.search);
  const roNumber = urlParams.get('id');

  // Use custom hooks for data fetching
  const {
    workOrder,
    customer,
    vehicle,
    lineItems,
    tagAlongs,
    otherCharges, // <-- ADDED THIS LINE
    upcomingAppointment,
    loading: workOrderLoading,
    error: workOrderError,
    setWorkOrder,
    setLineItems,
    refetch: refetchWorkOrder
  } = useWorkOrder(roNumber);

  const {
    inventory,
    employees,
    loading: shopDataLoading,
    error: shopDataError,
    refetchInventory
  } = useShopData();

  // State for lock management
  const [currentUser, setCurrentUser] = useState(null);
  const [isLockedByOtherUser, setIsLockedByOtherUser] = useState(false);
  const [lockedByUserName, setLockedByUserName] = useState(''); // Store the name of the user who locked it
  const [lockAcquired, setLockAcquired] = useState(false);
  const [lockCheckComplete, setLockCheckComplete] = useState(false);
  const lockAcquiredRef = useRef(false);
  const [lockError, setLockError] = useState(null); // NEW: lockError state

  // Add state for WorkPRO project data and new modals
  const [workPROProject, setWorkPROProject] = useState(null);
  const [workPROComments, setWorkPROComments] = useState([]);
  const [loadingWorkPRO, setLoadingWorkPRO] = useState(false);

  // NEW: State to manage the invoice conversion flow
  const [invoiceConversionPhase, setInvoiceConversionPhase] = useState(0);
  // NEW: State to indicate saving progress
  const [saving, setSaving] = useState(false);

  // NEW: State to manage pending returns that need to be processed on save
  const [pendingReturns, setPendingReturns] = useState([]);

  // NEW: State for selected line item index
  const [selectedLineIndex, setSelectedLineIndex] = useState(null);

  // NEW: Ref to track previous line items for deletion detection
  const previousLineItemsRef = useRef([]);

  const [showOdometerSimpleUpdateModal, setShowOdometerSimpleUpdateModal] = useState(false);

  // NEW: State for system settings
  const [systemSettings, setSystemSettings] = useState({
    shop_supply_rate: 0.07, // Default to 7%
    default_taxable: true, // Default to true
    tax_rate: 0.05,        // Default to 5%
  });


  // State for wip_legal from SystemSettings
  const [wipLegal, setWipLegal] = useState('');

  // State for all modals
  const [modals, setModals] = useState({
    print: false, // This modal is now specifically for the 'Preview' functionality
    send: false,
    workPRO: false, // Updated to workPRO for consistency with the component and requested change
    inspections: false,
    approvals: false,
    payments: false,
    scheduler: false,
    editAppt: false,
    appointmentsList: false,
    profitability: false,
    editCustomer: false,
    editVehicle: false,
    vehicleHistory: false,
    editWorkOrderDetails: false,
    // WorkPRO individual modals
    workPROTask: false,
    workPRODescription: false,
    workPROCommentsEdit: false,
    // NEW: General Work Order Notes Modal
    woNotes: false,
  });

  // State for the specific appointment being edited (from AppointmentsListModal or upcomingAppointment)
  const [selectedAppointmentForEdit, setSelectedAppointmentForEdit] = useState(null);

  // Local state for unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const navigate = useNavigate(); // NEW: Initialize navigate

  // Combined loading state
  const loading = workOrderLoading || shopDataLoading;

  // Combined error state
  const error = workOrderError || shopDataError || lockError; // Include lockError in combined error state

  // Parse existing payments for the modal - MOVED BEFORE EARLY RETURNS
  const existingPayments = React.useMemo(() => {
    try {
      return workOrder?.payments ? JSON.parse(workOrder.payments) : [];
    } catch (error) {
      console.warn('Failed to parse workOrder.payments:', error);
      return [];
    }
  }, [workOrder?.payments]);

  // Calculate live grand total for AdvancePaymentModal (same logic as FinancialSummary)
  const liveGrandTotal = React.useMemo(() => {
    if (!lineItems || lineItems.length === 0) return workOrder?.total_amount || 0;

    // Calculate Parts Total (includes core outstanding)
    const partsTotal = lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.qty) || 0;
      const partsEa = parseFloat(item.parts_ea) || 0;
      const coreNum = parseFloat(item.Core_num) || 0;
      const coreRet = parseFloat(item.core_ret) || 0;
      const coreCost = parseFloat(item.core_cost) || 0;
      const coreOsamt = (coreNum - coreRet) * coreCost;
      return sum + (qty * partsEa) + coreOsamt;
    }, 0);

    // Calculate Labor Total
    const laborTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.labour) || 0), 0);

    // Calculate Other Charges Total
    const otherChargesTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.oc_total) || 0), 0);

    // Calculate Grand Total Before Tax
    const grandTotalBeforeTax = partsTotal + laborTotal + otherChargesTotal;

    // Calculate Shop Supply Total (7% of ALL labor)
    const shopSupplyTotal = laborTotal * 0.07;

    // Calculate Taxable Base for GST
    let totalTaxableBase = 0;
    lineItems.forEach(item => {
      if (item.taxable === true) {
        const qty = parseFloat(item.qty) || 0;
        const partsEa = parseFloat(item.parts_ea) || 0;
        const labour = parseFloat(item.labour) || 0;
        const coreNum = parseFloat(item.Core_num) || 0;
        const coreRet = parseFloat(item.core_ret) || 0;
        const coreCost = parseFloat(item.core_cost) || 0;
        const coreOsamt = (coreNum - coreRet) * coreCost;
        const ocTotal = parseFloat(item.oc_total) || 0;
        const totParts = (qty * partsEa) + coreOsamt;
        const total = totParts + labour + ocTotal;
        totalTaxableBase += total;
      }
    });

    // Calculate taxable labor for shop supply
    const taxableLaborForShopSupply = lineItems.reduce((sum, item) => {
      if (item.taxable === true) {
        return sum + (parseFloat(item.labour) || 0);
      }
      return sum;
    }, 0);

    // Add taxable shop supplies to the taxable base
    const taxableShopSupplies = taxableLaborForShopSupply * 0.07;
    totalTaxableBase += taxableShopSupplies;

    // Calculate GST (5% of Total Taxable Base)
    const taxAmount = totalTaxableBase * 0.05;

    // Calculate Grand Total
    return grandTotalBeforeTax + shopSupplyTotal + taxAmount;
  }, [lineItems, workOrder?.total_amount]);

  const handlePrintDirect = useCallback(() => {
    // Direct print without opening modal - uses hidden print area
    window.print();
  }, []);

  const openModal = useCallback((modalName) => {
    // Add safety check for profitability modal
    if (modalName === 'profitability' && (!lineItems || lineItems.length === 0)) {
      alert('Line items data is not available yet. Please wait for the work order to load completely.');
      return;
    }
    setModals(prev => ({ ...prev, [modalName]: true }));
  }, [lineItems, setModals]);

  const closeModal = useCallback((modalName) => setModals(prev => ({ ...prev, [modalName]: false })), [setModals]);

  // Stable empty callback for WorkPRO modal - matches WorkOrderList pattern
  const handleWorkPROConnectionChange = useCallback(() => {
    // Empty callback - we don't need to track connection state in this context
  }, []);

  // Fetch current user
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = await UserEntity.me();
        setCurrentUser(user);
        console.log('=== LOCK: Current user fetched:', user.email);
      } catch (error) {
        console.error('=== LOCK: Failed to fetch current user:', error);
        setCurrentUser(null);
      }
    };
    fetchCurrentUser();
  }, []);

  // Load SystemSettings for wipLegal
  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        const settings = await SystemSettings.list();
        if (settings && settings.length > 0) {
          setWipLegal(settings[0].wip_legal || '');
        }
      } catch (error) {
        console.error('Error loading system settings:', error);
      }
    };
    loadSystemSettings();
  }, []);

  // Lock management - Acquire lock when work order and user are ready
  useEffect(() => {
    const acquireLock = async () => {
      // Early return if we don't have the required data yet, or if lock check is already complete
      if (!workOrder || !currentUser || lockCheckComplete) {
        console.log('=== LOCK: Waiting for workOrder, currentUser, or lock check complete...', {
          hasWorkOrder: !!workOrder,
          hasCurrentUser: !!currentUser,
          lockCheckComplete: lockCheckComplete
        });
        return;
      }

      console.log('=== LOCK: Starting lock acquisition process ===');
      console.log('=== LOCK: RO Number:', workOrder.ro_number);
      console.log('=== LOCK: Current User:', currentUser.email);

      try {
        // Refresh work order to get latest lock status and stage
        // Using workOrder.id for direct fetch as it's more precise when the ID is known.
        const freshWorkOrder = await WorkOrder.get(workOrder.id);
        if (!freshWorkOrder) {
          console.error('=== LOCK: Work order not found after refetch');
          setLockError('Work order data is missing.');
          setLockCheckComplete(true);
          return;
        }

        console.log('=== LOCK: Fresh WorkOrder loaded. RO:', freshWorkOrder.ro_number, 'Stage:', freshWorkOrder.stage);

        // Check work order stage immediately after loading
        if (freshWorkOrder.stage === 'invoice' || freshWorkOrder.stage === 'credit_invoice') {
          console.log('=== LOCK: Redirecting invoice/credit_invoice to WorkOrderView for RO:', freshWorkOrder.ro_number);
          navigate(createPageUrl(`WorkOrderView?id=${roNumber}`), { replace: true });
          return; // Stop further execution
        }

        console.log('=== LOCK: Fresh LockedByUser field:', freshWorkOrder.LockedByUser);

        if (freshWorkOrder.LockedByUser && freshWorkOrder.LockedByUser !== currentUser.email) {
          // Locked by another user - fetch their name
          console.log('=== LOCK: Work order is locked by another user:', freshWorkOrder.LockedByUser);

          // Fetch the user's full name
          try {
            const lockingUsers = await UserEntity.filter({ email: freshWorkOrder.LockedByUser });
            if (lockingUsers.length > 0) {
              setLockedByUserName(lockingUsers[0].full_name || freshWorkOrder.LockedByUser);
              console.log('=== LOCK: Locked by user name:', lockingUsers[0].full_name);
            } else {
              setLockedByUserName(freshWorkOrder.LockedByUser);
            }
          } catch (userFetchError) {
            console.error('=== LOCK: Failed to fetch locking user details:', userFetchError);
            setLockedByUserName(freshWorkOrder.LockedByUser);
          }

          setIsLockedByOtherUser(true);
          setLockAcquired(false);
          lockAcquiredRef.current = false;
        } else if (freshWorkOrder.LockedByUser === currentUser.email) {
          // User already holds the lock
          console.log('=== LOCK: Current user already holds the lock');
          setIsLockedByOtherUser(false);
          setLockAcquired(true);
          lockAcquiredRef.current = true;
        } else {
          // Not locked, acquire it
          console.log('=== LOCK: Lock is available, acquiring...');
          await WorkOrder.update(freshWorkOrder.id, { LockedByUser: currentUser.email });
          console.log('=== LOCK: Lock acquired successfully');
          setWorkOrder(prev => ({ ...prev, LockedByUser: currentUser.email }));
          setIsLockedByOtherUser(false);
          setLockAcquired(true);
          lockAcquiredRef.current = true;
        }
      } catch (error) {
        console.error('=== LOCK: Error during lock acquisition or data fetch:', error);
        setLockError('Failed to acquire lock. Please try again.');
        setLockCheckComplete(true);
        // Ensure UI isn't stuck on "locked by other" if error occurred, but allow viewing.
        setIsLockedByOtherUser(false);
        setLockAcquired(false);
      } finally {
        console.log('=== LOCK: Lock check complete');
        // Only mark complete if not already marked by an earlier return (e.g., due to redirect)
        if (!lockCheckComplete) {
          setLockCheckComplete(true);
        }
      }
    };

    acquireLock();
  }, [workOrder, currentUser, lockCheckComplete, setWorkOrder, navigate, roNumber]); // Added navigate, roNumber to deps

  // Warn user about unsaved changes before closing/leaving
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; // Required for Chrome
        return ''; // Required for some browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Lock management - Release lock on unmount and window close
  useEffect(() => {
    // Capture values needed for releaseLock that might become null on unmount
    const currentWorkOrderId = workOrder?.id;
    const currentRoNumber = workOrder?.ro_number;
    const currentUserEmail = currentUser?.email;

    const releaseLock = async () => {
      // Only proceed if we have the necessary IDs and THIS instance acquired the lock
      if (!currentWorkOrderId || !currentRoNumber || !currentUserEmail || !lockAcquiredRef.current) {
        console.log('=== LOCK: Skipping release lock - missing data or not acquired:',
          { currentWorkOrderId, currentRoNumber, currentUserEmail, lockAcquiredRef: lockAcquiredRef.current });
        return;
      }

      console.log('=== LOCK: Attempting to release lock for RO:', currentRoNumber, 'by user:', currentUserEmail);
      try {
        // OPTIONAL: Before releasing, a final check if *this* user actually holds the lock in the DB
        const freshWorkOrders = await WorkOrder.filter({ ro_number: currentRoNumber });
        const freshWorkOrder = freshWorkOrders.length > 0 ? freshWorkOrders[0] : null;

        if (freshWorkOrder && freshWorkOrder.LockedByUser === currentUserEmail) {
          await WorkOrder.update(currentWorkOrderId, { LockedByUser: null });
          console.log('=== LOCK: Lock released successfully for RO:', currentRoNumber);
        } else {
          console.log('=== LOCK: Lock not held by this user or already released by another for RO:', currentRoNumber);
        }
        lockAcquiredRef.current = false; // Always reset the ref state of *this* component
      } catch (error) {
        console.error('=== LOCK: Failed to release lock:', error);
      }
    };

    // Handle window close/unload event
    const handleBeforeUnload = (e) => {
      if (lockAcquiredRef.current && currentWorkOrderId && currentRoNumber) {
        console.log('=== LOCK: Window closing, initiating lock release via beforeunload for RO:', currentRoNumber);
        // Use `WorkOrder.update` directly. It sends a network request.
        // No `await` because `beforeunload` is synchronous.
        WorkOrder.update(currentWorkOrderId, { LockedByUser: null })
          .then(() => console.log('=== LOCK: Lock release initiated on beforeunload (best effort)'))
          .catch((error) => console.error('=== LOCK: Failed to initiate lock release on beforeunload:', error));
      } else {
        console.log('=== LOCK: Skipping beforeunload lock release - missing data or not acquired:',
          { currentWorkOrderId, currentRoNumber, currentUserEmail, lockAcquiredRef: lockAcquiredRef.current });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup function: runs when component unmounts or dependencies change
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // This `releaseLock` is for when the component unmounts normally (e.g., navigating within the app)
      releaseLock();
    };
  }, [workOrder?.id, workOrder?.ro_number, currentUser?.email]); // Changed dependencies to direct values


  // Fetch WorkPRO project data
  useEffect(() => {
    const fetchWorkPROData = async () => {
      if (!workOrder?.wo_number) return;

      setLoadingWorkPRO(true);
      try {
        const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
        const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018'; // Changed WORKPRO_APP_ID
        const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

        // Fetch project
        const projectResponse = await fetch(`${API_BASE_URL}/Project?work_order=${workOrder.wo_number}`, {
          headers: { 'api_key': WORKPRO_API_KEY }
        });

        if (projectResponse.ok) {
          const projectsData = await projectResponse.json();
          const projects = Array.isArray(projectsData) ? projectsData : (projectsData?.records || []);
          const foundProject = projects.length > 0 ? projects[0] : null;
          setWorkPROProject(foundProject);

          // Fetch comments if project exists
          if (foundProject) {
            const commentsResponse = await fetch(`${API_BASE_URL}/ProjectComment?project_id=${foundProject.id}`, {
              headers: { 'api_key': WORKPRO_API_KEY }
            });

            if (commentsResponse.ok) {
              const commentsData = await commentsResponse.json();
              const commentsArray = Array.isArray(commentsData) ? commentsData : (commentsData?.records || []);
              setWorkPROComments(commentsArray.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
            }
          }
        }
      } catch (error) {
        console.error('Error fetching WorkPRO data:', error);
      } finally {
        setLoadingWorkPRO(false);
      }
    };

    fetchWorkPROData();
  }, [workOrder?.wo_number]);

  // Handle WorkPRO updates
  const handleWorkPROUpdate = (field, value) => {
    setWorkPROProject(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleWorkPROCommentsUpdate = (newComments) => {
    setWorkPROComments(newComments);
  };

  // Centralized save logic
  const handleSave = useCallback(async (updatedDetails = {}, showAlertOnSuccess = true) => {
    if (!workOrder || !workOrder.id) {
      console.error('Cannot save: workOrder or workOrder.id is missing');
      return;
    }

    console.log('=== SAVE: Starting handleSave ===');
    console.log('Current lineItems state:', lineItems);
    console.log('Updated details received:', updatedDetails);

    setSaving(true);

    try {
      // 1. Apply default_taxable changes to all line items if it changed
      let workingLineItems = lineItems;
      if (updatedDetails.default_taxable !== undefined && updatedDetails.default_taxable !== workOrder?.default_taxable) {
        console.log(`=== SAVE: Applying new default_taxable (${updatedDetails.default_taxable}) to all line items ===`);
        workingLineItems = lineItems.map(line => ({
          ...line,
          taxable: updatedDetails.default_taxable
        }));
        setLineItems(workingLineItems); // Update state immediately
      }

      // 2. Detect and process deleted line items (replenish inventory)
      console.log('=== SAVE: Checking for deleted line items ===');
      const previousLines = previousLineItemsRef.current || [];
      const currentLineIds = new Set(workingLineItems.map(line => line.id));
      const deletedLines = previousLines.filter(prevLine => 
        prevLine.id && !currentLineIds.has(prevLine.id) && prevLine.inventory_processed && prevLine.inventory_item_id
      );

      if (deletedLines.length > 0) {
        console.log(`=== SAVE: Found ${deletedLines.length} deleted line items with processed inventory ===`);
        for (const deletedLine of deletedLines) {
          try {
            const qtyToReturn = parseFloat(deletedLine.qty) || 0;
            if (qtyToReturn <= 0) continue;

            console.log(`=== SAVE: Replenishing inventory for deleted line: ${deletedLine.description || deletedLine.part_number}, qty: ${qtyToReturn} ===`);

            // Get current inventory item
            const inventoryItem = await InventoryItem.get(deletedLine.inventory_item_id);
            const currentQOH = inventoryItem.quantity_on_hand || 0;
            const newQOH = currentQOH + qtyToReturn;

            // Update inventory
            await InventoryItem.update(deletedLine.inventory_item_id, {
              quantity_on_hand: newQOH
            });

            // Create inventory transaction
            await InventoryTxs.create({
              inventory_item_id: deletedLine.inventory_item_id,
              part_num: deletedLine.part_number || inventoryItem.part_number,
              tx_date: new Date().toISOString(),
              tx_type: 'Returned to Stock from WO',
              quantity_change: qtyToReturn,
              quantity_ordered_change: 0,
              ro_number: workOrder.ro_number,
              source_record_id: workOrder.id,
              description: `Returned ${qtyToReturn} units to inventory from deleted line on WO ${workOrder.ro_number}`
            });

            console.log(`=== SAVE: Successfully replenished ${qtyToReturn} units for ${deletedLine.part_number} ===`);
          } catch (error) {
            console.error(`Failed to replenish inventory for deleted line ${deletedLine.part_number}:`, error);
            // Continue processing other deletions even if one fails
          }
        }
      }

      // 3. Process any pending returns
      if (pendingReturns.length > 0) {
        console.log('=== SAVE: Processing pending returns:', pendingReturns);
        for (const returnItem of pendingReturns) {
          try {
            const inventoryItem = await InventoryItem.get(returnItem.inventory_item_id);
            const currentQOH = inventoryItem.quantity_on_hand || 0;
            const newQOH = currentQOH + returnItem.qtyToReturn;

            await InventoryItem.update(returnItem.inventory_item_id, {
              quantity_on_hand: newQOH
            });

            await InventoryTxs.create({
              inventory_item_id: returnItem.inventory_item_id,
              part_num: returnItem.part_number,
              tx_date: new Date().toISOString(),
              tx_type: 'Returned from WO',
              quantity_change: returnItem.qtyToReturn,
              quantity_ordered_change: 0,
              ro_number: workOrder.ro_number,
              source_record_id: workOrder.id,
              description: `Returned ${returnItem.qtyToReturn} units to inventory from WO ${workOrder.ro_number}`
            });

            console.log(`=== SAVE: Processed return for ${returnItem.part_number}: +${returnItem.qtyToReturn} to QOH`);
          } catch (error) {
            console.error(`Failed to process return for ${returnItem.part_number}:`, error);
          }
        }
        setPendingReturns([]);
      }

      // 3. Process inventory for new/unprocessed line items using WOGetPart
      const lineItemsAfterInventoryProcessing = await Promise.all(workingLineItems.map(async (line) => {
        // Skip if already processed, or no inventory item, or no quantity
        if (line.inventory_processed || !line.inventory_item_id || parseFloat(line.qty) <= 0) {
          return line;
        }

        console.log('=== DEBUG: Processing inventory for line item:', line.description, line.part_number, 'Requested Qty:', line.qty);

        try {
          // Invoke the backend WOGetPart function
          const adjustmentResponse = await base44.functions.invoke('WOGetPart', {
            inventoryItemId: line.inventory_item_id,
            requestedQuantity: parseFloat(line.qty),
            workOrderId: workOrder.id,
            roNumber: workOrder.ro_number,
            lineDescription: line.description,
            linePartNumber: line.part_number,
            // Pass line's current qty_on_order for consideration in WOGetPart if it handles POs
            lineQtyOnOrder: parseFloat(line.qty_on_order) || 0
          });

          if (adjustmentResponse.data.success) {
            const { issuedQuantity, onOrderQuantity } = adjustmentResponse.data;
            console.log(`Inventory processed for ${line.part_number}: Issued ${issuedQuantity}, On Order Remaining ${onOrderQuantity}`);

            // Return updated line item with qty_on_order tracking pending fulfillment
            // qty remains unchanged - it represents the total requested quantity
            return {
              ...line,
              qty_on_order: onOrderQuantity, // Track how much is still pending fulfillment
              inventory_processed: true
            };
          } else {
            console.error('Failed to adjust inventory via WOGetPart for line:', line.part_number, 'Message:', adjustmentResponse.data.message);
            // If failed, do not mark as processed, return original line
            return line;
          }
        } catch (error) {
          console.error('Error invoking WOGetPart for line:', line.part_number, error);
          // If error, do not mark as processed
          return line;
        }
      }));

      // Update the local state with the processed line items.
      // This is crucial because financial calculations depend on potentially adjusted 'qty' and 'qty_on_order'.
      // Although `setLineItems` causes a re-render, for the *current* `handleSave` execution,
      // we'll use `lineItemsAfterInventoryProcessing` directly for subsequent steps.
      setLineItems(lineItemsAfterInventoryProcessing);


      // --- 3. First pass: Calculate derived values (core_osamt, tot_parts, total) for each item ---
      // This ensures tot_parts and total are correctly calculated before aggregation.
      // Use lineItemsAfterInventoryProcessing for these calculations
      const currentLineItemsState = lineItemsAfterInventoryProcessing;
      const lineItemsToCalculate = currentLineItemsState.filter(item =>
        item && (item.description || item.part_number || item.qty || item.hrs || item.is_other_charge)
      );

      const calculatedLineItems = lineItemsToCalculate.map(item => {
        const qty = parseFloat(item.qty) || 0;
        const partsEa = parseFloat(item.parts_ea) || 0;
        const labour = parseFloat(item.labour) || 0;
        const coreNum = parseFloat(item.Core_num) || 0;
        const coreRet = parseFloat(item.core_ret) || 0;
        const coreCost = parseFloat(item.core_cost) || 0;
        const ocTotal = parseFloat(item.oc_total) || 0;

        const core_osamt = (coreNum - coreRet) * coreCost;
        const tot_parts = (qty * partsEa) + core_osamt;
        const total = tot_parts + labour + ocTotal; // total here is pre-tax
        return {
          ...item,
          core_osamt: core_osamt,
          tot_parts: tot_parts,
          total: total,
        };
      });

      // --- NEW CALCULATION LOGIC (from outline), applied to calculatedLineItems ---
      console.log('=== SAVE: Starting financial calculations (New Outline Logic) ===');

      const itemsForAggregation = calculatedLineItems; // Use the already processed and calculated items

      // Calculate Parts Subtotal (includes core_osamt)
      const partsSubtotal = itemsForAggregation.reduce((sum, line) => {
        const parts = parseFloat(line.tot_parts) || 0; // tot_parts is already calculated
        return sum + parts;
      }, 0);

      // Calculate Labor Subtotal
      const laborSubtotal = itemsForAggregation.reduce((sum, line) => {
        const labor = parseFloat(line.labour) || 0;
        return sum + labor;
      }, 0);

      // Calculate Other Charges Subtotal
      const otherChargesSubtotal = itemsForAggregation.reduce((sum, line) => {
        const ocTotal = parseFloat(line.oc_total) || 0;
        return sum + ocTotal;
      }, 0);

      // Calculate shop supply based on ALL labor, if rate > 0 (aligned with FinancialSummary.js)
      const shopSupplyRate = systemSettings?.shop_supply_rate || 0.07; // Use systemSettings for rate, default to 0.07
      const shopSupplyTotal = laborSubtotal * shopSupplyRate; // <-- CHANGED THIS LINE

      // Subtotal before tax (parts + labor + other charges + shop supply)
      const subtotal = partsSubtotal + laborSubtotal + otherChargesSubtotal + shopSupplyTotal;

      // Calculate taxable amount for GST
      // Note: FinancialSummary.js has more complex logic for taxable base,
      // here we align with WorkOrderReport.js's simpler approach: sum of (taxable line item totals + taxable shop supply).
      // If there's a discrepancy with FinancialSummary's taxable base, it might need further alignment.
      let totalTaxableBase = 0;
      let taxableLaborForShopSupply = 0; // To align with FinancialSummary's taxable shop supplies

      itemsForAggregation.forEach(item => {
        if (item.taxable !== false) { // Default to true if not specified
          const lineParts = parseFloat(item.tot_parts) || 0;
          const lineLabour = parseFloat(item.labour) || 0;
          const lineOcTotal = parseFloat(item.oc_total) || 0;
          totalTaxableBase += (lineParts + lineLabour + lineOcTotal);
          taxableLaborForShopSupply += lineLabour;
        }
      });

      const taxableShopSupplies = taxableLaborForShopSupply * shopSupplyRate; // Use the same rate
      totalTaxableBase += (systemSettings.default_taxable ? taxableShopSupplies : 0); // Only add if default_taxable

      const taxAmount = totalTaxableBase * (systemSettings.tax_rate || 0.05); // Use systemSettings for tax rate

      const totalAmount = subtotal + taxAmount; // Final total

      console.log('=== CALCULATIONS FOR COMPARISON (NEW OUTLINE LOGIC) ===');
      console.log('Parts Subtotal (incl. Core Outstanding):', partsSubtotal);
      console.log('Labor Subtotal:', laborSubtotal);
      console.log('Other Charges Subtotal:', otherChargesSubtotal);
      console.log('Shop Supplies Total (based on labor):', shopSupplyTotal);
      console.log('Subtotal (pre-tax):', subtotal);
      console.log('Taxable Amount (excluding taxable shop supply):', totalTaxableBase - (systemSettings.default_taxable ? taxableShopSupplies : 0));
      console.log('Taxable Amount (with taxable shop supply):', totalTaxableBase);
      console.log('Tax Amount:', taxAmount);
      console.log('Final Total:', totalAmount);
      console.log('==============================================');

      // Prepare line items for database save - Using the calculatedLineItems
      const lineItemsToSave = calculatedLineItems.map(item => {
        const baseLineItem = {
          id: item.id,
          inventory_item_id: item.inventory_item_id || null,
          part_number: item.part_number || '',
          description: item.description || '',
          unit: item.unit || '',
          qty: item.qty || 0,
          qty_on_order: item.qty_on_order || 0, // This will be the value from WOGetPart if processed
          hrs: item.hrs || 0,
          parts_ea: item.parts_ea || 0,
          tot_parts: item.tot_parts, // Use calculated value
          cost_ea: item.cost_ea || 0,
          labour: item.labour || 0,
          total: item.total, // Use calculated value (pre-tax total for the line)
          taxable: item.taxable !== false,
          complete: item.complete || false,
          bold: item.bold || false,
          inventory_processed: item.inventory_processed || false, // Crucial to save this state
          Core_num: item.Core_num || 0,
          core_ret: item.core_ret || 0,
          core_cost: item.core_cost || 0,
          core_osamt: item.core_osamt, // Use calculated value
          is_other_charge: item.is_other_charge || false,
          oc_total: item.oc_total || 0,
          gl_account: item.gl_account || '', // Add GL account for other charges
          serial_num: item.serial_num || ''
        };
        if (item.supplier_invoice_line_id) {
          baseLineItem.supplier_invoice_line_id = item.supplier_invoice_line_id;
        }
        return baseLineItem;
      });

      console.log('=== SAVE: Prepared line items for save:', lineItemsToSave);

      // Save work order with updated calculations
      const finalWorkOrderDetails = {
        parts_total: partsSubtotal,
        labor_total: laborSubtotal,
        shop_supply_total: shopSupplyTotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
      };

      let workOrderData = { // Use let because we might modify it
        ...workOrder,
        ...updatedDetails, // Merge with the passed updatedDetails parameter
        ...finalWorkOrderDetails, // Apply calculated totals
        line_items: JSON.stringify(lineItemsToSave),
      };

      // NEW: Prevent premature stage/converted updates during invoice conversion flow
      // Note: invoice_date is allowed to be saved in phase 3 when user selects it
      if (invoiceConversionPhase > 0 && invoiceConversionPhase < 4) {
        console.log('=== SAVE: Invoice conversion active, preventing stage/converted/inv_number updates.');
        delete workOrderData.stage;
        delete workOrderData.converted;
        delete workOrderData.inv_number;
        // Don't delete invoice_date - allow it to be saved when user sets it in phase 3
      }

      console.log('=== SAVE: Saving work order data:', workOrderData);

      await WorkOrder.update(workOrder.id, workOrderData);

      // NEW: Handle explicit lock release if updatedDetails did not specify LockedByUser
      // and the work order data still shows it as locked by someone.
      if (!updatedDetails.LockedByUser && workOrderData.LockedByUser !== null && workOrderData.LockedByUser !== '') {
          console.log('=== LOCK: handleSave implicitly clearing LockedByUser.');
          await WorkOrder.update(workOrder.id, { LockedByUser: null });
          // Update the local data to reflect this change immediately
          workOrderData.LockedByUser = null; // Reflect change locally for setWorkOrder
      }

      console.log('=== SAVE: Work order saved successfully ===');

      // Update local state
      setWorkOrder(workOrderData); // Use the potentially modified workOrderData
      setHasUnsavedChanges(false);

      // Update the ref with the current line items after successful save
      previousLineItemsRef.current = [...lineItemsAfterInventoryProcessing];

      if (showAlertOnSuccess) {
        alert('Work order saved successfully!');
      }

      // Refetch to ensure UI is in sync with database
      await refetchWorkOrder();

    } catch (error) {
      console.error('=== SAVE: Error saving work order:', error);
      alert('Failed to save work order. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [workOrder, lineItems, systemSettings, invoiceConversionPhase, refetchWorkOrder, pendingReturns, setLineItems]);


  // NEW: Handler for processing advance payments
  const handleProcessAdvancePayment = useCallback(async (action, payload) => {
    if (!workOrder) {
      throw new Error('Work order data is not available');
    }

    try {
      if (action === 'add') {
        // Create new CustomerPayments record
        const newCustomerPaymentData = {
          customer_id: workOrder.customer_id,
          work_order_id: workOrder.id, // Use the actual WorkOrder entity ID
          amount: payload.amount,
          payment_method: payload.method,
          payment_date: payload.date,
          reference: payload.reference || '',
          notes: `Payment for RO ${workOrder.ro_number}`,
          deposited: false,
          gl_posted: false,
          ar_pmt: false, // This is a direct WO payment, not AR-specific
          invoice_number: workOrder.inv_number || '' // Include invoice number if available
        };

        console.log('Creating CustomerPayments record:', newCustomerPaymentData);
        const createdPayment = await CustomerPayments.create(newCustomerPaymentData);
        console.log('Successfully created CustomerPayments:', createdPayment);

        // Update WorkOrder.payments JSON string
        let currentPayments = [];
        try {
          currentPayments = workOrder.payments ? JSON.parse(workOrder.payments) : [];
        } catch (parseError) {
          console.warn('Failed to parse existing payments, starting with empty array:', parseError);
          currentPayments = [];
        }

        // Add the new payment to the array (include the database ID)
        const paymentForJson = {
          id: createdPayment.id,
          amount: createdPayment.amount,
          payment_method: createdPayment.payment_method,
          payment_date: createdPayment.payment_date,
          reference: createdPayment.reference,
          notes: createdPayment.notes
        };

        currentPayments.push(paymentForJson);

        // Update WorkOrder with new payments JSON
        const updatedPaymentsJson = JSON.stringify(currentPayments);
        console.log('Updating WorkOrder payments:', updatedPaymentsJson);

        await handleSave({
          payments: updatedPaymentsJson,
          amount_paid: currentPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        }, false); // Silent save

        console.log('Payment added and WorkOrder updated successfully');

      } else if (action === 'delete') {
        const paymentIdToDelete = payload.id;

        console.log('Deleting CustomerPayments record with ID:', paymentIdToDelete);
        await CustomerPayments.delete(paymentIdToDelete);
        console.log('Successfully deleted CustomerPayments record');

        // Update WorkOrder.payments JSON string
        let currentPayments = [];
        try {
          currentPayments = workOrder.payments ? JSON.parse(workOrder.payments) : [];
        } catch (parseError) {
          console.warn('Failed to parse existing payments, starting with empty array:', parseError);
          currentPayments = [];
        }

        // Remove the payment from the array
        const filteredPayments = currentPayments.filter(p => p.id !== paymentIdToDelete);

        // Update WorkOrder with filtered payments JSON
        const updatedPaymentsJson = JSON.stringify(filteredPayments);
        console.log('Updating WorkOrder payments after deletion:', updatedPaymentsJson);

        await handleSave({
          payments: updatedPaymentsJson,
          amount_paid: filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        }, false); // Silent save

        console.log('Payment deleted and WorkOrder updated successfully');

      } else {
        throw new Error(`Unknown payment action: ${action}`);
      }

    } catch (error) {
      console.error(`Error processing payment ${action}:`, error);
      // Re-throw the error so the modal can handle it
      throw new Error(`Failed to ${action} payment: ${error.message}`);
    }
  }, [workOrder, handleSave]);

  // NEW: Handler for processing invoice payments (similar to advance payments but for A/R)
  const handleProcessInvoicePayment = useCallback(async (action, payload) => {
    if (!workOrder) {
      throw new Error('Work order data is not available');
    }

    try {
      if (action === 'add') {
        // Create new CustomerPayments record for invoice payment
        const newCustomerPaymentData = {
          customer_id: workOrder.customer_id,
          work_order_id: workOrder.id, // Use the actual WorkOrder entity ID
          amount: payload.amount,
          payment_method: payload.method,
          payment_date: payload.date,
          notes: `Payment for Invoice ${workOrder.inv_number || workOrder.ro_number}`,
          deposited: false,
          gl_posted: false,
          ar_pmt: false, // Invoice payments are direct payments, not AR-specific
          invoice_number: workOrder.inv_number || '' // Include invoice number
        };
        
        // Add cheque fields if payment method is cheque
        if (payload.method === 'cheque') {
          newCustomerPaymentData.cheque_name = payload.cheque_name || '';
          newCustomerPaymentData.cheque_number = payload.cheque_number || '';
        }

        console.log('Creating CustomerPayments record for invoice:', newCustomerPaymentData);
        const createdPayment = await CustomerPayments.create(newCustomerPaymentData);
        console.log('Successfully created CustomerPayments for invoice:', createdPayment);

        // Update WorkOrder.payments JSON string
        let currentPayments = [];
        try {
          currentPayments = workOrder.payments ? JSON.parse(workOrder.payments) : [];
        } catch (parseError) {
          console.warn('Failed to parse existing payments, starting with empty array:', parseError);
          currentPayments = [];
        }

        // Add the new payment to the array (include the database ID)
        const paymentForJson = {
          id: createdPayment.id,
          amount: createdPayment.amount,
          payment_method: createdPayment.payment_method,
          payment_date: createdPayment.payment_date,
          reference: createdPayment.reference,
          notes: createdPayment.notes
        };

        currentPayments.push(paymentForJson);

        // Update WorkOrder with new payments JSON and amount_paid
        const updatedPaymentsJson = JSON.stringify(currentPayments);
        const newTotalPaid = currentPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        console.log('Updating WorkOrder payments for invoice:', updatedPaymentsJson);

        await handleSave({
          payments: updatedPaymentsJson,
          amount_paid: newTotalPaid
        }, false); // Silent save

        console.log('Invoice payment added and WorkOrder updated successfully');

      } else if (action === 'delete') {
        const paymentIdToDelete = payload.id;

        console.log('Deleting CustomerPayments record with ID:', paymentIdToDelete);
        await CustomerPayments.delete(paymentIdToDelete);
        console.log('Successfully deleted CustomerPayments record');

        // Update WorkOrder.payments JSON string
        let currentPayments = [];
        try {
          currentPayments = workOrder.payments ? JSON.parse(workOrder.payments) : [];
        } catch (parseError) {
          console.warn('Failed to parse existing payments, starting with empty array:', parseError);
          currentPayments = [];
        }

        // Remove the payment from the array
        const filteredPayments = currentPayments.filter(p => p.id !== paymentIdToDelete);

        // Update WorkOrder with filtered payments JSON and amount_paid
        const updatedPaymentsJson = JSON.stringify(filteredPayments);
        const newTotalPaid = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        console.log('Updating WorkOrder payments after invoice payment deletion:', updatedPaymentsJson);

        await handleSave({
          payments: updatedPaymentsJson,
          amount_paid: newTotalPaid
        }, false); // Silent save

        console.log('Invoice payment deleted and WorkOrder updated successfully');

      } else {
        throw new Error(`Unknown payment action: ${action}`);
      }

    } catch (error) {
      console.error(`Error processing invoice payment ${action}:`, error);
      // Re-throw the error so the modal can handle it
      throw new Error(`Failed to ${action} invoice payment: ${error.message}`);
    }
  }, [workOrder, handleSave]);


  // NEW: Callback to cancel the invoice conversion process
  const onConversionModalCancel = useCallback(async () => {
    try {
      // Revert stage and converted status
      await handleSave({ stage: 'work_order', converted: false }, false); // Silent save
      setInvoiceConversionPhase(0);
      alert('Invoice conversion cancelled. Work order has been reverted to "Work Order" stage.');
    } catch (error) {
      console.error('Error reverting work order after cancellation:', error);
      setInvoiceConversionPhase(0); // Ensure phase reset even on error
      alert('Invoice conversion cancelled, but an error occurred during reversion. Please check the work order manually.');
    }
  }, [handleSave]);

  // NEW: Callback to handle submissions from conversion modals
  const onConversionModalSubmit = useCallback(async (data) => {
    try {
      if (invoiceConversionPhase === 1) { // Odometer submitted (first step in conversion flow)
        console.log('Submitting Odometer:', data.odometer);
        // Save odometer. Stage and converted will be handled in phase 4.
        await handleSave({ odometer: data.odometer }, false);
        setInvoiceConversionPhase(2); // Advance to description phase
      } else if (invoiceConversionPhase === 2) { // Description data submitted
        console.log('Submitting Description:', data.description);
        await handleSave({ description: data.description }, false);
        setInvoiceConversionPhase(3); // Advance to payment phase
      } else if (invoiceConversionPhase === 3) { // Invoice date submitted from InvoicePaymentModal
        console.log('Submitting Invoice Date:', data.invoice_date);
        // Save the invoice date to the work order before navigation
        await handleSave({
          invoice_date: data.invoice_date
        }, false);
        // Navigation is handled by InvoicePaymentModal after this returns
        setInvoiceConversionPhase(0); // Reset phase as modal handles navigation
      }
    } catch (error) {
      console.error('Error during conversion step submission:', error);
      alert('An error occurred while saving conversion data. Conversion cancelled.');
      onConversionModalCancel(); // Use the cancellation fallback
    }
  }, [invoiceConversionPhase, handleSave, existingPayments, workOrder?.ro_number, onConversionModalCancel]);

  const handleConvertToInvoice = useCallback(async () => {
    if (!workOrder) return;

    // Validation: Check if any line items have quantity on order
    const lineItemsWithPartsOnOrder = lineItems.filter(line => {
      const qtyOnOrder = parseFloat(line.qty_on_order) || 0;
      return qtyOnOrder > 0;
    });

    if (lineItemsWithPartsOnOrder.length > 0) {
      const partsList = lineItemsWithPartsOnOrder
        .map(line => `- ${line.description || line.part_number || 'Unknown'}: ${line.qty_on_order} on order`)
        .join('\n');

      alert(`Cannot convert to invoice. The following line items have parts on order:\n\n${partsList}\n\nPlease receive all parts before converting to invoice.`);
      return;
    }

    // Validation: Ensure work order is in work_order stage
    if (workOrder.stage !== 'work_order') {
      alert('Only work orders in the "Work Order" stage can be converted to invoices.');
      return;
    }

    // Confirmation before starting conversion process
    const confirmed = window.confirm('Convert to Invoice?');
    if (!confirmed) return;

    // Start conversion process
    setInvoiceConversionPhase(1);
  }, [workOrder, lineItems]);

  const handleHeaderSaveClick = async () => {
    try {
      await handleSave({}, false); // Save without showing alert

      // Release the lock before closing
      // Use lockAcquiredRef.current to accurately check if THIS instance holds the lock
      if (workOrder && currentUser && lockAcquiredRef.current) {
        console.log('=== LOCK: Releasing lock on save and close for RO:', workOrder.ro_number);
        await WorkOrder.update(workOrder.id, { LockedByUser: null });
        lockAcquiredRef.current = false; // Reset ref state after explicit release
        console.log('=== LOCK: Lock released successfully on save and close.');
      }

      // Show brief success message
      const successMessage = document.createElement('div');
      successMessage.textContent = '✓ Work Order Saved Successfully';
      successMessage.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        animation: slideIn 0.3s ease-out;
      `;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      if (!document.getElementById('slideIn-animation-style')) {
        style.id = 'slideIn-animation-style';
        document.head.appendChild(style);
      }
      document.body.appendChild(style);
      document.body.appendChild(successMessage);

      // Close window after brief delay
      setTimeout(() => {
        successMessage.remove();
        window.close();
      }, 1000);

    } catch (error) {
      alert(`Failed to save work order: ${error.message}`);
    }
  };

  const handleCustomerUpdate = async (customerData) => {
    try {
      if (customer) {
        await Customer.update(customer.id, customerData);
        refetchWorkOrder();
        closeModal('editCustomer');
        alert('Customer updated successfully!');
      }
    } catch (error) {
      console.error("Failed to update customer:", error);
      alert('Failed to update customer.');
    }
  };

  const handleVehicleUpdate = async (vehicleData) => {
    try {
      if (vehicle) {
        await Vehicle.update(vehicle.id, vehicleData);
        refetchWorkOrder();
        closeModal('editVehicle');
        alert('Vehicle updated successfully!');
      }
    } catch (error) {
      console.error("Failed to update vehicle:", error);
      alert('Failed to update vehicle.');
    }
  };

  const handleStatusChange = (newStatus) => {
    if (workOrder && workOrder.status !== newStatus) {
      setWorkOrder(prev => ({ ...prev, status: newStatus }));
      setHasUnsavedChanges(true);
    }
  };

  const handleStageChange = async (newStage) => {
    if (newStage === 'invoice' && workOrder.stage !== 'invoice') {
      await handleConvertToInvoice();
      return;
    }

    if (newStage === 'credit_invoice' && workOrder.stage !== 'credit_invoice') {
      const url = createPageUrl(`/CreditInvoice?id=${workOrder.ro_number}`);
      window.open(url, '_blank', 'width=1600,height=1000');
      return;
    }

    const confirmed = window.confirm(`Change stage to ${newStage}?`);
    if (!confirmed) return;

    try {
      // Prepare update object
      const updateData = { stage: newStage };
      
      // Set wo_date and wo_number when converting to work_order stage
      if (newStage === 'work_order' && !workOrder.wo_date) {
        updateData.wo_date = format(new Date(), 'yyyy-MM-dd');
        
        // Generate wo_number from ro_number if not already set
        if (!workOrder.wo_number && workOrder.ro_number) {
          const roNumericPart = workOrder.ro_number.replace(/\D/g, '');
          updateData.wo_number = `WO${roNumericPart}`;
        }
      }
      
      await handleSave(updateData, false);
      setWorkOrder(prev => ({ ...prev, ...updateData }));
    } catch (error) {
      console.error('Error changing stage:', error);
      alert('Failed to change stage. Please try again.');
    }
  };

  const handleAppointmentClick = () => {
    if (upcomingAppointment) {
      setSelectedAppointmentForEdit(upcomingAppointment); // Set the current WO's appt for editing
      openModal('editAppt');
    } else {
      openModal('scheduler');
    }
  }

  const handleOdometerSimpleUpdateSubmit = async (data) => {
    await handleSave({ odometer: data.odometer }, true);
    setShowOdometerSimpleUpdateModal(false);
    refetchWorkOrder();
  };

  const handleOpenOdometerPrompt = () => {
    setShowOdometerSimpleUpdateModal(true);
  };

  const handleViewOnlyMode = async () => {
    try {
      // Release the lock before navigating
      if (workOrder && workOrder.id && currentUser && lockAcquiredRef.current) {
        console.log('=== VIEW ONLY: Releasing lock before navigation for RO:', workOrder.ro_number);
        await WorkOrder.update(workOrder.id, { LockedByUser: null });
        lockAcquiredRef.current = false; // Reset ref state after explicit release
        console.log('=== VIEW ONLY: Lock released successfully.');
      }

      // Navigate to WorkOrderView in the same tab
      navigate(createPageUrl(`WorkOrderView?id=${roNumber}`));
    } catch (error) {
      console.error('=== VIEW ONLY: Error releasing lock:', error);
      // Navigate anyway even if lock release fails
      navigate(createPageUrl(`WorkOrderView?id=${roNumber}`));
    }
  };

  // Show loading until both data and lock check are complete
  if ((loading && !workOrder) || !lockCheckComplete) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">
            {!lockCheckComplete ? 'Checking work order status...' : 'Loading work order...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 text-lg font-semibold">Error loading work order</p>
          <p className="text-gray-600 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 text-lg">Work order not found</p>
        </div>
      </div>
    );
  }

  // NEW: If locked by another user, show the lock message with options
  if (isLockedByOtherUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full shadow-xl">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              {/* Lock Icon */}
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              </div>

              {/* Message */}
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  Work Order Currently Being Edited
                </h2>
                <p className="text-lg text-slate-700">
                  Work Order <span className="font-semibold">{workOrder.wo_number || workOrder.ro_number}</span> is currently being edited by:
                </p>
                <p className="text-xl font-bold text-blue-600 mt-2">
                  {lockedByUserName || 'Another User'}
                </p>
                <p className="text-sm text-slate-600 mt-4">
                  You can view the last saved version, close this window, or try again.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                <Button
                  onClick={() => {
                    const viewUrl = createPageUrl(`WorkOrderView?id=${roNumber}`);
                    window.location.href = viewUrl;
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Only (Last Save)
                </Button>

                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>

                <Button
                  onClick={() => window.close()}
                  variant="outline"
                >
                  <X className="w-4 h-4 mr-2" />
                  Close
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statuses = ["Open", "Parts On Order", "Scheduled", "On Hold", "Completed"];

  const stages = [
    {
      key: 'estimate',
      label: 'Estimate',
      activeColor: 'bg-orange-500 text-white border-orange-600',
      inactiveColor: 'text-orange-700 hover:bg-orange-100', // Updated hover color
      disabled: workOrder?.stage === 'work_order' || workOrder?.stage === 'invoice'
    },
    {
      key: 'work_order',
      label: 'Work Order',
      activeColor: 'bg-blue-600 text-white border-blue-700',
      inactiveColor: 'text-blue-700 hover:bg-blue-100', // Updated hover color
      disabled: workOrder?.stage === 'invoice'
    },
    {
      key: 'invoice',
      label: 'Invoice',
      activeColor: 'bg-green-600 text-white border-green-700',
      inactiveColor: 'text-green-700 hover:bg-green-100', // Updated hover color
      disabled: workOrder?.stage === 'estimate'
    },
  ];

  return (
    <>
      {/* Print-only styles */}
      <style>
        {`
          @media print {
            /* Hide the main screen content completely */
            .screen-only-area {
              display: none !important;
            }

            /* Make the dedicated print area visible and the only thing on the page */
            .print-only-area {
              display: block !important; /* Override inline display:none */
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              background: white !important;
              padding: 0 !important;
              margin: 0 !important;
            }
          }
        `}
      </style>

      {/* Add 'screen-only-area' class to the main wrapper */}
      <div className="min-h-screen bg-slate-50 screen-only-area">
        {/* Toolbar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Document Actions Group */}
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handlePrintDirect}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <Button variant="outline" onClick={() => openModal('send')}>
                  <Send className="w-4 h-4 mr-2" />
                  Send
                </Button>
              </div>

              {/* Separator */}
              <div className="w-px h-6 bg-slate-300"></div>

              {/* NEW: View Only Mode Button */}
              <Button
                variant="outline"
                onClick={handleViewOnlyMode}
                className="bg-white"
              >
                <Eye className="w-4 h-4 mr-2" />
                View Only Mode
              </Button>

              {/* Separator */}
              <div className="w-px h-6 bg-slate-300"></div>

              {/* Financial Operations Group */}
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => openModal('payments')}>
                  <DollarSign className="w-4 h-4 mr-2" />
                  Payments
                </Button>
                <Button variant="outline" onClick={() => openModal('profitability')}>
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Profitability
                </Button>
                <Button variant="outline" onClick={() => openModal('woNotes')}>
                  <FileText className="w-4 h-4 mr-2" />
                  WO Notes
                </Button>
              </div>

              {/* Separator */}
              <div className="w-px h-6 bg-slate-300"></div>

              {/* Work Order Controls Group - Stage Selector with Save Button */}
              <div className="flex items-center gap-4">
                {/* Stage Selector with Save Button - NEW DESIGN */}
                <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
                  {stages.map((stage, index) => (
                    <button
                      key={stage.key}
                      onClick={() => !stage.disabled && handleStageChange(stage.key)}
                      disabled={stage.disabled}
                      className={`
                        px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200
                        ${workOrder?.stage === stage.key
                          ? stage.activeColor + ' shadow-sm'
                          : stage.disabled
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : stage.inactiveColor + ' bg-transparent'
                        }
                        ${index < stages.length ? 'mr-1' : ''}
                      `}
                    >
                      {stage.label}
                    </button>
                  ))}

                  {/* Save Button inside toggle bar */}
                  <button
                    onClick={handleHeaderSaveClick}
                    disabled={saving}
                    className="px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 bg-slate-900 hover:bg-slate-800 text-white shadow-sm flex items-center gap-2 ml-1"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-Toolbar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 sticky top-[69px] z-20 shadow-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  {statuses.map(status => (
                    <Button
                      key={status}
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStatusChange(status)}
                      className={`transition-all duration-200 text-xs font-bold ${workOrder?.status === status ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                    >
                      {status}
                    </Button>
                  ))}
                </div>

                <div className="w-px h-6 bg-slate-300"></div>

                {/* WorkPRO Section - Direct Button */}
                <div className="flex items-center gap-3">
                  <div
                    onClick={() => openModal('workPRO')}
                    className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 px-2 py-1 rounded transition-colors"
                  >
                    {/* Status indicator circle */}
                    <div className={`w-3 h-3 rounded-full ${workPROProject ? 'bg-green-500' : 'bg-orange-400'}`}></div>
                    <span className="text-sm font-semibold text-slate-700">WorkPRO</span>
                    {workPROProject ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800 text-xs">
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-orange-100 text-orange-700 text-xs">
                        Connect
                      </Badge>
                    )}
                  </div>

                  {loadingWorkPRO && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  )}
                </div>

            </div>

            <div className="flex items-center gap-3">
              {/* Calendar Icon - Opens Appointments List Modal */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => openModal('appointmentsList')}
                className="p-2"
              >
                <CalendarDays className="w-5 h-5" />
              </Button>

              {/* Appointment Display Area */}
              <div
                className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-100"
                onClick={handleAppointmentClick}
              >
                <div className="text-sm">
                  {upcomingAppointment && upcomingAppointment.start_time ? (
                    <>
                      <p className="font-semibold text-slate-800">
                        {format(new Date(upcomingAppointment.start_time), 'EEE, MMM d, yyyy')}
                      </p>
                      <p className="text-slate-600">
                        {format(new Date(upcomingAppointment.start_time), 'h:mm a')}
                      </p>
                    </>
                  ) : (
                    <p className="font-semibold text-slate-500">No Appointment Scheduled</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Form Content */}
        <div className="max-w-7xl mx-auto p-6">
          {workOrder && (
            <WorkOrderForm
              workOrder={workOrder}
              customer={customer}
              vehicle={vehicle}
              employees={employees}
              inventory={inventory}
              lineItems={lineItems}
              tagAlongs={tagAlongs}
              otherCharges={otherCharges} // Passing otherCharges
              setParentLineItems={(items) => {
                setLineItems(items);
                setHasUnsavedChanges(true);
              }}
              onSave={handleSave}
              onCancel={() => window.close()}
              onEditCustomer={() => openModal('editCustomer')}
              onEditVehicle={() => openModal('editVehicle')}
              onShowVehicleHistory={() => openModal('vehicleHistory')}
              onEditWorkOrderDetails={() => openModal('editWorkOrderDetails')}
              onSelectedLineChange={setSelectedLineIndex}
              onOpenOdometerPrompt={handleOpenOdometerPrompt}
              onOpenApprovals={() => openModal('approvals')}
            />
          )}
        </div>
      </div>

      {/* Hidden Print Area - Always rendered but only visible during print */}
      <div className="print-only-area" style={{ display: 'none' }}>
        {workOrder && (
          <WorkOrderReport
            workOrder={workOrder}
            customer={customer}
            vehicle={vehicle}
            lineItems={lineItems || []}
            wipLegal={wipLegal}
          />
        )}
      </div>

      {/* Modals */}
      {workOrder && (
        <>
          {/* Print Modal - Now serves as preview only */}
          <Dialog open={modals.print} onOpenChange={() => closeModal('print')}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex justify-between items-center">
                  <span>Work Order Preview</span>
                  <Button onClick={handlePrintDirect} className="no-print">
                    <Printer className="w-4 h-4 mr-2" />
                    Print
                  </Button>
                </DialogTitle>
                <DialogDescription>
                  Preview of the work order. Click Print to print this document.
                </DialogDescription>
              </DialogHeader>
              <WorkOrderReport
                workOrder={workOrder}
                customer={customer}
                vehicle={vehicle}
                lineItems={lineItems || []}
              />
            </DialogContent>
          </Dialog>

          <SESEmailModal open={modals.send} onClose={() => closeModal('send')} workOrder={workOrder} customer={customer} />

          {/* WorkPRO Modal (Still exists for other potential triggers or for consistency if needed, but now also explicitly triggered by the "WorkPRO Hub" dropdown item) */}
          {modals.workPRO && workOrder && (
            <WorkPROModal
              open={modals.workPRO}
              onClose={() => closeModal('workPRO')}
              workOrder={workOrder}
              customer={customer}
              vehicles={vehicle ? [vehicle] : []}
              onConnectionChange={handleWorkPROConnectionChange}
            />
          )}

          <ROInspectionModal open={modals.inspections} onClose={() => closeModal('inspections')} roNumber={workOrder.ro_number} />
          <ROApprovalsModal open={modals.approvals} onClose={() => closeModal('approvals')} cpId={workOrder.cp_id} />
          <AdvancePaymentModal
            open={modals.payments}
            onClose={() => closeModal('payments')}
            workOrder={workOrder}
            payments={existingPayments}
            onProcessPayment={handleProcessAdvancePayment}
            totalOwing={liveGrandTotal}
          />
          <SchedulerViaWoModal
            open={modals.scheduler}
            onClose={() => closeModal('scheduler')}
            workOrder={workOrder}
            customer={customer}
            vehicle={vehicle}
            onAppointmentUpdated={() => { refetchWorkOrder(); closeModal('scheduler'); }}
          />
          <EditApptViaWoModal
            open={modals.editAppt}
            onClose={() => { closeModal('editAppt'); setSelectedAppointmentForEdit(null); }}
            appointment={selectedAppointmentForEdit || upcomingAppointment}
            workOrder={workOrder}
            customer={customer}
            vehicle={vehicle}
            onAppointmentUpdated={refetchWorkOrder}
          />
          <AppointmentsListModal
            open={modals.appointmentsList}
            onClose={() => closeModal('appointmentsList')}
            workOrderId={workOrder?.id}
            displayNumber={workOrder?.wo_number || workOrder?.ro_number}
            onAppointmentClick={(appointment) => {
              closeModal('appointmentsList');
              setSelectedAppointmentForEdit(appointment);
              openModal('editAppt');
            }}
            onNewAppointment={() => {
              closeModal('appointmentsList');
              openModal('scheduler');
            }}
          />
          {lineItems && (
            <WorkOrderProfitability
              open={modals.profitability}
              onClose={() => closeModal('profitability')}
              workOrder={workOrder}
              lineItems={lineItems}
              workPROProject={workPROProject}
              employees={employees}
            />
          )}

          {/* New Modals */}
          <Dialog open={modals.editCustomer} onOpenChange={() => closeModal('editCustomer')}>
            <DialogContent>
              {customer && <CustomerForm customer={customer} onSubmit={handleCustomerUpdate} onCancel={() => closeModal('editCustomer')} />}
            </DialogContent>
          </Dialog>

          <Dialog open={modals.editVehicle} onOpenChange={() => closeModal('editVehicle')}>
            <DialogContent>
              {vehicle && <VehicleForm vehicle={vehicle} customers={[customer]} onSubmit={handleVehicleUpdate} onCancel={() => closeModal('editVehicle')} />}
            </DialogContent>
          </Dialog>

          <VehicleHistoryModal open={modals.vehicleHistory} onClose={() => closeModal('vehicleHistory')} vehicle={vehicle} />

          <WorkOrderDetailsEditModal 
            open={modals.editWorkOrderDetails} 
            onClose={() => closeModal('editWorkOrderDetails')} 
            workOrder={workOrder} 
            onSave={handleSave}
            lineItems={lineItems}
            onUpdateLineItems={setLineItems}
          />

          {/* WorkPRO Individual Modals */}
          <WorkPROTaskModal
            open={modals.workPROTask}
            onClose={() => closeModal('workPROTask')}
            workOrder={workOrder}
            project={workPROProject}
            onUpdate={handleWorkPROUpdate}
          />

          <WorkPRODescriptionModal
            open={modals.workPRODescription}
            onClose={() => closeModal('workPRODescription')}
            workOrder={workOrder}
            project={workPROProject}
            onUpdate={handleWorkPROUpdate}
          />

          <WorkPROCommentsModal
            open={modals.workPROCommentsEdit}
            onClose={() => closeModal('workPROCommentsEdit')}
            workOrder={workOrder}
            project={workPROProject}
            comments={workPROComments}
            onUpdate={handleWorkPROCommentsUpdate}
          />

          {/* NEW: General Work Order Notes Modal */}
          <WONotesModal
            open={modals.woNotes}
            onClose={() => closeModal('woNotes')}
            workOrder={workOrder}
            onUpdate={handleSave}
          />

          {/* OdometerPromptModal for invoice conversion (phase 1) */}
          <OdometerPromptModal
            open={invoiceConversionPhase === 1}
            onClose={onConversionModalCancel}
            onSubmit={onConversionModalSubmit}
            workOrder={workOrder}
            workPROProject={workPROProject}
            mode="invoiceConversion"
            vehicle={vehicle}
          />

          {/* New OdometerPromptModal for simple update */}
          <OdometerPromptModal
            open={showOdometerSimpleUpdateModal}
            onClose={() => setShowOdometerSimpleUpdateModal(false)}
            onSubmit={handleOdometerSimpleUpdateSubmit}
            workOrder={workOrder}
            workPROProject={workPROProject}
            mode="simpleUpdate"
            vehicle={vehicle}
          />

          {/* NEW: Invoice Description Modal for Invoice Conversion (phase 2) */}
          <InvoiceDescriptionModal
            open={invoiceConversionPhase === 2}
            onClose={onConversionModalCancel}
            onSubmit={onConversionModalSubmit}
            workOrder={workOrder}
          />

          {/* NEW: Invoice Payment Modal for Invoice Conversion (phase 3) */}
          <InvoicePaymentModal
            open={invoiceConversionPhase === 3}
            onClose={onConversionModalCancel}
            onSubmit={onConversionModalSubmit}
            workOrder={workOrder}
            customer={customer}
            totalAmount={workOrder?.total_amount || 0}
            existingPayments={existingPayments}
            onProcessPayment={handleProcessInvoicePayment}
          />
        </>
      )}
    </>
  );
}