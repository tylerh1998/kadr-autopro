import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useWorkOrder } from '../hooks/useWorkOrder';
import { useShopData } from '../hooks/useInventory';
import { WorkOrder, Customer, Vehicle, Appointment, InventoryItem, InventoryTxs, CustomerPayments, User as UserEntity, SystemSettings, WorkOrderStatus } from '@/entities/all';
import WorkOrderForm from './form/WorkOrderForm';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import {
  Save,
  Printer,
  Send,
  Wrench,
  DollarSign,
  CalendarDays,
  FileCheck,
  ClipboardList,
  Clock,
  BarChart3,
  Eye,
  Briefcase,
  ClipboardCheck,
  UserCheck,
  Loader2,
  FileText,
  RefreshCw,
  X,
  ExternalLink,
  ArrowRightCircle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

// Import all necessary modals
import WorkOrderReport from './WorkOrderReport';
import WorkOrderPdfModal from './WorkOrderPdfModal';
import SESEmailModal from './SESEmailModal';
import WorkPROModal from './WorkPROModal';
import ROInspectionModal from './ROInspectionModal';
import ROApprovalsModal from './ROApprovalsModal';
import AdvancePaymentModal from './AdvancePaymentModal';
import SchedulerViaWoModal from './SchedulerViaWoModal';
import EditApptViaWoModal from './EditApptViaWoModal';
import AppointmentsListModal from './AppointmentsListModal';
import WorkOrderProfitability from './WorkOrderProfitability';

// Import Modals for editing
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import CustomerForm from '../customers/CustomerForm';
import VehicleForm from '../vehicles/VehicleForm';
import VehicleHistoryModal from '../vehicles/VehicleHistoryModal';
import WorkOrderDetailsEditModal from './form/WorkOrderDetailsEditModal';

// Import the new WorkPRO modals
import WorkPROTaskModal from './WorkPROTaskModal';
import WorkPRODescriptionModal from './WorkPRODescriptionModal';
import WorkPROCommentsModal from './WorkPROCommentsModal';

// NEW import: WONotesModal & OdometerPromptModal & InvoiceDescriptionModal
import WONotesModal from './WONotesModal';
import OdometerPromptModal from './OdometerPromptModal';
import InvoiceDescriptionModal from './InvoiceDescriptionModal';
import InvoicePaymentModal from './InvoicePaymentModal';

// NEW: Import Card components for the lock message
import { Card, CardContent } from '@/components/ui/card';

export default function DocumentEditor({ mode = 'work_order' }) {
  const urlParams = new URLSearchParams(window.location.search);
  const roNumber = urlParams.get('id');

  // Use custom hooks for data fetching
  const {
    workOrder,
    customer,
    vehicle,
    lineItems,
    tagAlongs,
    otherCharges,
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
  const [isAlreadyOpenByMe, setIsAlreadyOpenByMe] = useState(false);
  const [lockedByUserName, setLockedByUserName] = useState('');
  const [lockAcquired, setLockAcquired] = useState(false);
  const [lockCheckComplete, setLockCheckComplete] = useState(false);
  const lockAcquiredRef = useRef(false);
  const [lockError, setLockError] = useState(null);

  // Add state for WorkPRO project data and new modals
  const [workPROProject, setWorkPROProject] = useState(null);
  const [workPROComments, setWorkPROComments] = useState([]);
  const [loadingWorkPRO, setLoadingWorkPRO] = useState(false);

  // NEW: State to manage the invoice conversion flow
  const [invoiceConversionPhase, setInvoiceConversionPhase] = useState(0);
  // NEW: State to indicate saving progress
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  // NEW: State to manage pending returns that need to be processed on save
  const [pendingReturns, setPendingReturns] = useState([]);

  // NEW: State for selected line item index
  const [selectedLineIndex, setSelectedLineIndex] = useState(null);

  // NEW: Ref to track previous line items for deletion detection
  const previousLineItemsRef = useRef([]);
  // Ref to track latest line items to prevent race conditions during save
  const latestLineItemsRef = useRef(lineItems);

  useEffect(() => {
    latestLineItemsRef.current = lineItems;
  }, [lineItems]);

  // Initialize previousLineItemsRef on first load of valid data to enable deletion tracking
  useEffect(() => {
    if (lineItems && lineItems.length > 0 && previousLineItemsRef.current.length === 0) {
       previousLineItemsRef.current = JSON.parse(JSON.stringify(lineItems));
    }
  }, [lineItems]);

  const [showOdometerSimpleUpdateModal, setShowOdometerSimpleUpdateModal] = useState(false);

  // NEW: State for system settings
  const [systemSettings, setSystemSettings] = useState({
    shop_supply_rate: 0.07,
    default_taxable: true,
    tax_rate: 0.05,
  });

  // State for wip_legal and default_message from SystemSettings
  const [wipLegal, setWipLegal] = useState('');
  const [defaultMessage, setDefaultMessage] = useState('');

  // NEW: State for work order statuses
  const [workOrderStatuses, setWorkOrderStatuses] = useState([]);

  // State for all modals
  const [modals, setModals] = useState({
    print: false,
    send: false,
    workPRO: false,
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
    workPROTask: false,
    workPRODescription: false,
    workPROCommentsEdit: false,
    woNotes: false,
    pdf: false,
  });

  // State for the specific appointment being edited
  const [selectedAppointmentForEdit, setSelectedAppointmentForEdit] = useState(null);

  // Local state for unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const navigate = useNavigate();

  // Combined loading state
  const loading = workOrderLoading || shopDataLoading;

  // Combined error state
  const error = workOrderError || shopDataError || lockError;

  // Parse existing payments for the modal
  const existingPayments = React.useMemo(() => {
    try {
      return workOrder?.payments ? JSON.parse(workOrder.payments) : [];
    } catch (error) {
      console.warn('Failed to parse workOrder.payments:', error);
      return [];
    }
  }, [workOrder?.payments]);

  // Calculate live grand total for AdvancePaymentModal
  const liveGrandTotal = React.useMemo(() => {
    if (!lineItems || lineItems.length === 0) return workOrder?.total_amount || 0;

    const partsTotal = lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.qty) || 0;
      const partsEa = parseFloat(item.parts_ea) || 0;
      const coreNum = parseFloat(item.Core_num) || 0;
      const coreRet = parseFloat(item.core_ret) || 0;
      const coreCost = parseFloat(item.core_cost) || 0;
      const coreOsamt = (coreNum - coreRet) * coreCost;
      return sum + (qty * partsEa) + coreOsamt;
    }, 0);

    const laborTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.labour) || 0), 0);
    const otherChargesTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.oc_total) || 0), 0);
    const grandTotalBeforeTax = partsTotal + laborTotal + otherChargesTotal;
    const shopSupplyTotal = laborTotal * 0.07;

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

    const taxableLaborForShopSupply = lineItems.reduce((sum, item) => {
      if (item.taxable === true) {
        return sum + (parseFloat(item.labour) || 0);
      }
      return sum;
    }, 0);

    const taxableShopSupplies = taxableLaborForShopSupply * 0.07;
    totalTaxableBase += taxableShopSupplies;
    const taxAmount = totalTaxableBase * 0.05;

    return grandTotalBeforeTax + shopSupplyTotal + taxAmount;
  }, [lineItems, workOrder?.total_amount]);

  const handlePrintDirect = useCallback(() => {
    setModals(prev => ({ ...prev, pdf: true }));
  }, []);

  const openModal = useCallback((modalName) => {
    if (modalName === 'profitability' && (!lineItems || lineItems.length === 0)) {
      alert('Line items data is not available yet. Please wait for the work order to load completely.');
      return;
    }
    setModals(prev => ({ ...prev, [modalName]: true }));
  }, [lineItems, setModals]);

  const closeModal = useCallback((modalName) => setModals(prev => ({ ...prev, [modalName]: false })), [setModals]);

  const handleWorkPROConnectionChange = useCallback(() => {
  }, []);

  // Fetch current user
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = await UserEntity.me();
        setCurrentUser(user);
      } catch (error) {
        console.error('=== LOCK: Failed to fetch current user:', error);
        setCurrentUser(null);
      }
    };
    fetchCurrentUser();
  }, []);

  // Load SystemSettings
  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        const settings = await SystemSettings.list();
        if (settings && settings.length > 0) {
          setWipLegal(settings[0].wip_legal || '');
          setDefaultMessage(settings[0].default_message || '');
          setSystemSettings(prev => ({
            ...prev,
            shop_supply_rate: settings[0].shop_supply_rate !== undefined ? settings[0].shop_supply_rate / 100 : 0.07,
            default_taxable: settings[0].default_taxable !== undefined ? settings[0].default_taxable : true,
            tax_rate: settings[0].tax_rate !== undefined ? settings[0].tax_rate : 0.05,
          }));
        }
      } catch (error) {
        console.error('Error loading system settings:', error);
      }
    };
    loadSystemSettings();
  }, []);

  // Load WorkOrderStatus settings
  useEffect(() => {
    const loadWorkOrderStatuses = async () => {
      try {
        const statuses = await WorkOrderStatus.filter({ is_active: true });
        const sortedStatuses = statuses.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        setWorkOrderStatuses(sortedStatuses);
      } catch (error) {
        console.error('Error loading work order statuses:', error);
        setWorkOrderStatuses([
          { name: 'Open', display_order: 1, color: 'slate' },
          { name: 'Parts On Order', display_order: 2, color: 'slate' },
          { name: 'Scheduled', display_order: 3, color: 'slate' },
          { name: 'On Hold', display_order: 4, color: 'slate' },
          { name: 'Completed', display_order: 5, color: 'slate' }
        ]);
      }
    };
    loadWorkOrderStatuses();
  }, []);

  // Lock management
  useEffect(() => {
    const acquireLock = async () => {
      if (!workOrder || !currentUser || lockCheckComplete) {
        return;
      }

      try {
        const freshWorkOrder = await WorkOrder.get(workOrder.id);
        if (!freshWorkOrder) {
          setLockError('Work order data is missing.');
          setLockCheckComplete(true);
          return;
        }

        if (freshWorkOrder.stage === 'invoice' || freshWorkOrder.stage === 'credit_invoice') {
          navigate(createPageUrl(`WorkOrderView?id=${roNumber}`), { replace: true });
          return;
        }

        // Redirect based on stage and mode
        if (mode === 'work_order' && freshWorkOrder.stage === 'estimate') {
          navigate(createPageUrl(`EstimateEdit?id=${roNumber}`), { replace: true });
          return;
        }
        if (mode === 'estimate' && freshWorkOrder.stage === 'work_order') {
          navigate(createPageUrl(`WorkOrderEdit?id=${roNumber}`), { replace: true });
          return;
        }

        if (freshWorkOrder.LockedByUser && freshWorkOrder.LockedByUser !== currentUser.email) {
          try {
            const lockingUsers = await UserEntity.filter({ email: freshWorkOrder.LockedByUser });
            if (lockingUsers.length > 0) {
              setLockedByUserName(lockingUsers[0].User_name || lockingUsers[0].full_name || freshWorkOrder.LockedByUser);
            } else {
              setLockedByUserName(freshWorkOrder.LockedByUser);
            }
          } catch (userFetchError) {
            setLockedByUserName(freshWorkOrder.LockedByUser);
          }

          setIsLockedByOtherUser(true);
          setLockAcquired(false);
          lockAcquiredRef.current = false;
        } else if (freshWorkOrder.LockedByUser === currentUser.email) {
          setIsAlreadyOpenByMe(true);
          setLockCheckComplete(true);
        } else {
          await WorkOrder.update(freshWorkOrder.id, { LockedByUser: currentUser.email });
          setWorkOrder(prev => ({ ...prev, LockedByUser: currentUser.email }));
          setIsLockedByOtherUser(false);
          setLockAcquired(true);
          lockAcquiredRef.current = true;
        }
      } catch (error) {
        console.error('=== LOCK: Error during lock acquisition or data fetch:', error);
        setLockError('Failed to acquire lock. Please try again.');
        setLockCheckComplete(true);
        setIsLockedByOtherUser(false);
        setLockAcquired(false);
      } finally {
        if (!lockCheckComplete) {
          setLockCheckComplete(true);
        }
      }
    };

    acquireLock();
  }, [workOrder, currentUser, lockCheckComplete, setWorkOrder, navigate, roNumber]);

  // Ctrl+P shortcut for PDF modal
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
        event.preventDefault();
        setModals(prev => ({ ...prev, pdf: true }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Warn user about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Release lock on unmount
  useEffect(() => {
    const currentWorkOrderId = workOrder?.id;
    const currentRoNumber = workOrder?.ro_number;
    const currentUserEmail = currentUser?.email;

    const releaseLock = async () => {
      if (!currentWorkOrderId || !currentRoNumber || !currentUserEmail || !lockAcquiredRef.current) {
        return;
      }

      try {
        const freshWorkOrders = await WorkOrder.filter({ ro_number: currentRoNumber });
        const freshWorkOrder = freshWorkOrders.length > 0 ? freshWorkOrders[0] : null;

        if (freshWorkOrder && freshWorkOrder.LockedByUser === currentUserEmail) {
          await WorkOrder.update(currentWorkOrderId, { LockedByUser: null });
        }
        lockAcquiredRef.current = false;
      } catch (error) {
        console.error('=== LOCK: Failed to release lock:', error);
      }
    };

    const handleBeforeUnload = (e) => {
      if (lockAcquiredRef.current && currentWorkOrderId && currentRoNumber) {
        WorkOrder.update(currentWorkOrderId, { LockedByUser: null })
          .then(() => {})
          .catch((error) => console.error('=== LOCK: Failed to initiate lock release on beforeunload:', error));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      releaseLock();
    };
  }, [workOrder?.id, workOrder?.ro_number, currentUser?.email]);

  // Fetch WorkPRO project data
  useEffect(() => {
    const fetchWorkPROData = async () => {
      if (!workOrder?.wo_number) return;

      setLoadingWorkPRO(true);
      try {
        // Use backend proxy for project fetching
        const projectResponse = await base44.functions.invoke('workProProxy', {
          entityName: 'Project',
          method: 'filter',
          params: {
            work_order: workOrder.wo_number
          }
        });

        if (projectResponse.data.success) {
          const projects = projectResponse.data.data || [];
          const foundProject = projects.length > 0 ? projects[0] : null;
          setWorkPROProject(foundProject);

          if (foundProject) {
            // Use backend proxy for comments fetching
            const commentsResponse = await base44.functions.invoke('workProProxy', {
              entityName: 'ProjectComment',
              method: 'filter',
              params: {
                project_id: foundProject.id
              }
            });

            if (commentsResponse.data.success) {
              const commentsArray = commentsResponse.data.data || [];
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

  const handleWorkPROUpdate = (field, value) => {
    setWorkPROProject(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleWorkPROCommentsUpdate = (newComments) => {
    setWorkPROComments(newComments);
  };

  // Centralized save logic
  const handleSave = useCallback(async (updatedDetails = {}, showAlertOnSuccess = true, lineItemsOverride = null) => {
    if (!workOrder || !workOrder.id) {
      console.error('Cannot save: workOrder or workOrder.id is missing');
      return;
    }

    setSaving(true);

    try {
      let workingLineItems = lineItemsOverride || lineItems;
      if (updatedDetails.default_taxable !== undefined && updatedDetails.default_taxable !== workOrder?.default_taxable) {
        workingLineItems = lineItems.map(line => ({
          ...line,
          taxable: updatedDetails.default_taxable
        }));
        setLineItems(workingLineItems);
      }

      // Inventory Logic - Only for 'work_order' mode
      if (mode === 'work_order') {
        // Detect and process deleted line items
        const previousLines = previousLineItemsRef.current || [];
        const currentLineIds = new Set(workingLineItems.map(line => line.id));
        const deletedLines = previousLines.filter(prevLine => 
          prevLine.id && !currentLineIds.has(prevLine.id) && prevLine.inventory_processed && prevLine.inventory_item_id
        );

        if (deletedLines.length > 0) {
          for (const deletedLine of deletedLines) {
            try {
              const totalQty = parseFloat(deletedLine.qty) || 0;
              const qtyOnOrder = parseFloat(deletedLine.qty_on_order) || 0;
              
              if (totalQty <= 0 && qtyOnOrder <= 0) continue;

              const inventoryItem = await InventoryItem.get(deletedLine.inventory_item_id);
              if (!inventoryItem) continue;

              let newQOH = parseFloat(inventoryItem.quantity_on_hand) || 0;
              let newQOO = parseFloat(inventoryItem.quantity_on_order) || 0;
              let quantityChange = 0;
              let quantityOrderedChange = 0;
              let txDescriptions = [];
              let txTypes = [];

              // Handle return to QOH (only if it was issued from QOH)
              const issuedFromQOH = Math.max(0, totalQty - qtyOnOrder);
              
              if (issuedFromQOH > 0) {
                newQOH += issuedFromQOH;
                quantityChange = issuedFromQOH;
                txTypes.push('Returned from WO');
                txDescriptions.push(`Returned ${issuedFromQOH} units to inventory from deleted line on ${workOrder.ro_number}`);
              }

              // Handle cancellation of on-order
              if (qtyOnOrder > 0) {
                newQOO = Math.max(0, newQOO - qtyOnOrder);
                quantityOrderedChange = -qtyOnOrder;
                txTypes.push('Order cancelled from WO');
                txDescriptions.push(`Cancelled ${qtyOnOrder} on order from deleted line on ${workOrder.ro_number}`);
              }

              if (quantityChange !== 0 || quantityOrderedChange !== 0) {
                await InventoryItem.update(deletedLine.inventory_item_id, {
                  quantity_on_hand: newQOH,
                  quantity_on_order: newQOO
                });

                await InventoryTxs.create({
                  inventory_item_id: deletedLine.inventory_item_id,
                  part_num: deletedLine.part_number || inventoryItem.part_number,
                  tx_date: new Date().toISOString(),
                  tx_type: txTypes.length > 0 ? txTypes.join(' & ') : 'WO Line Deleted',
                  quantity_change: quantityChange,
                  quantity_ordered_change: quantityOrderedChange,
                  ro_number: workOrder.ro_number,
                  source_record_id: workOrder.id,
                  description: txDescriptions.join('; ') || `Line item deleted from WO ${workOrder.ro_number}`
                });
              }
            } catch (error) {
              console.error(`Failed to replenish inventory for deleted line ${deletedLine.part_number}:`, error);
            }
          }
        }

        // Process pending returns
        if (pendingReturns.length > 0) {
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
                description: `Returned ${returnItem.qtyToReturn} units to inventory from ${workOrder.ro_number}`
              });
            } catch (error) {
              console.error(`Failed to process return for ${returnItem.part_number}:`, error);
            }
          }
          setPendingReturns([]);
        }
      }

      // Process inventory for new/unprocessed line items using WOGetPart
      // Only for 'work_order' mode
      const lineItemsAfterInventoryProcessing = await Promise.all(workingLineItems.map(async (line) => {
        if (mode === 'estimate') return line; // Skip processing in estimate mode

        if (line.inventory_processed || !line.inventory_item_id || parseFloat(line.qty) <= 0) {
          return line;
        }

        try {
          const adjustmentResponse = await base44.functions.invoke('WOGetPart', {
            inventoryItemId: line.inventory_item_id,
            requestedQuantity: parseFloat(line.qty),
            workOrderId: workOrder.id,
            roNumber: workOrder.ro_number,
            lineDescription: line.description,
            linePartNumber: line.part_number,
            lineQtyOnOrder: parseFloat(line.qty_on_order) || 0
          });

          if (adjustmentResponse.data.success) {
            const { onOrderQuantity } = adjustmentResponse.data;
            return {
              ...line,
              qty_on_order: onOrderQuantity,
              inventory_processed: true
            };
          } else {
            console.error('Failed to adjust inventory via WOGetPart for line:', line.part_number);
            return line;
          }
        } catch (error) {
          console.error('Error invoking WOGetPart for line:', line.part_number, error);
          return line;
        }
      }));

      // Use functional update to merge processed inventory data with any user edits made during save
      setLineItems(currentLines => {
        const processedMap = new Map(lineItemsAfterInventoryProcessing.map(l => [l.id, l]));
        return currentLines.map(currentLine => {
          const processedLine = processedMap.get(currentLine.id);
          if (!processedLine) return currentLine;
          return {
            ...currentLine,
            // Only update system/backend fields, preserving user edits (desc, qty, etc.)
            qty_on_order: processedLine.qty_on_order,
            inventory_processed: processedLine.inventory_processed,
            supplier_invoice_line_id: processedLine.supplier_invoice_line_id,
          };
        });
      });

      // Financial Calculations
      const currentLineItemsState = lineItemsAfterInventoryProcessing;
      const lineItemsToCalculate = currentLineItemsState.filter(item =>
        item && (
          item.description || 
          item.part_number || 
          item.inventory_item_id || 
          item.is_other_charge || 
          item.manually_inserted ||
          (parseFloat(item.qty) || 0) !== 0 ||
          (parseFloat(item.hrs) || 0) !== 0 ||
          (parseFloat(item.labour) || 0) !== 0 ||
          (parseFloat(item.parts_ea) || 0) !== 0 ||
          (parseFloat(item.total) || 0) !== 0
        )
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
        const total = tot_parts + labour + ocTotal;
        return {
          ...item,
          core_osamt: core_osamt,
          tot_parts: tot_parts,
          total: total,
        };
      });

      const itemsForAggregation = calculatedLineItems;

      const partsSubtotal = itemsForAggregation.reduce((sum, line) => sum + (parseFloat(line.tot_parts) || 0), 0);
      const laborSubtotal = itemsForAggregation.reduce((sum, line) => sum + (parseFloat(line.labour) || 0), 0);
      const otherChargesSubtotal = itemsForAggregation.reduce((sum, line) => sum + (parseFloat(line.oc_total) || 0), 0);

      const shopSupplyRate = systemSettings?.shop_supply_rate || 0.07;
      const shopSupplyTotal = laborSubtotal * shopSupplyRate;

      const subtotal = partsSubtotal + laborSubtotal + otherChargesSubtotal + shopSupplyTotal;

      let totalTaxableBase = 0;
      let taxableLaborForShopSupply = 0;

      itemsForAggregation.forEach(item => {
        if (item.taxable !== false) {
          const lineParts = parseFloat(item.tot_parts) || 0;
          const lineLabour = parseFloat(item.labour) || 0;
          const lineOcTotal = parseFloat(item.oc_total) || 0;
          totalTaxableBase += (lineParts + lineLabour + lineOcTotal);
          taxableLaborForShopSupply += lineLabour;
        }
      });

      const taxableShopSupplies = taxableLaborForShopSupply * shopSupplyRate;
      totalTaxableBase += (systemSettings.default_taxable ? taxableShopSupplies : 0);

      const taxAmount = totalTaxableBase * (systemSettings.tax_rate || 0.05);
      const totalAmount = subtotal + taxAmount;

      const lineItemsToSave = calculatedLineItems.map(item => {
        const baseLineItem = {
          id: item.id,
          inventory_item_id: item.inventory_item_id || null,
          part_number: item.part_number || '',
          description: item.description || '',
          unit: item.unit || '',
          qty: item.qty || 0,
          qty_on_order: item.qty_on_order || 0,
          hrs: item.hrs || 0,
          parts_ea: item.parts_ea || 0,
          tot_parts: item.tot_parts,
          cost_ea: item.cost_ea || 0,
          labour: item.labour || 0,
          total: item.total,
          taxable: item.taxable !== false,
          complete: item.complete || false,
          bold: item.bold || false,
          inventory_processed: item.inventory_processed || false,
          Core_num: item.Core_num || 0,
          core_ret: item.core_ret || 0,
          core_cost: item.core_cost || 0,
          core_osamt: item.core_osamt,
          is_other_charge: item.is_other_charge || false,
          oc_total: item.oc_total || 0,
          gl_account: item.gl_account || '',
          serial_num: item.serial_num || '',
          other_charge_id: item.other_charge_id || null // Ensure this is preserved for Levies tracking
        };
        if (item.supplier_invoice_line_id) {
          baseLineItem.supplier_invoice_line_id = item.supplier_invoice_line_id;
        }
        return baseLineItem;
      });

      const finalWorkOrderDetails = {
        parts_total: partsSubtotal,
        labor_total: laborSubtotal,
        shop_supply_total: shopSupplyTotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
      };

      let workOrderData = {
        ...workOrder,
        ...updatedDetails,
        ...finalWorkOrderDetails,
        line_items: JSON.stringify(lineItemsToSave),
      };

      // Create a copy for the API update to avoid mutating workOrderData which is used for local state
      const apiPayload = { ...workOrderData };

      if (invoiceConversionPhase > 0 && invoiceConversionPhase < 4) {
        delete apiPayload.stage;
        delete apiPayload.converted;
        delete apiPayload.inv_number;
      }

      await WorkOrder.update(workOrder.id, apiPayload);

      // Lock is ONLY cleared when handleHeaderSaveClick explicitly requests it (by calling update separately)
      // or when updatedDetails.LockedByUser is explicitly set to null (which is not typically done via handleSave calls here)
      // The automatic clearing logic has been removed to prevent clearing lock on intermediate saves (like sending email).

      setWorkOrder(workOrderData);
      
      // Check if user made changes during the save process
      // We compare the JSON string of critical fields to see if "latest" differs from what we just saved ("working")
      const getLineFingerprint = (lines) => JSON.stringify(lines.map(l => ({ 
        id: l.id, d: l.description, q: l.qty, p: l.part_number, h: l.hrs, m: l.manually_inserted 
      })));
      
      const latestFingerprint = getLineFingerprint(latestLineItemsRef.current || []);
      const savedFingerprint = getLineFingerprint(workingLineItems || []);
      
      if (latestFingerprint !== savedFingerprint) {
        console.log('User made changes during save - keeping unsaved changes flag active');
        setHasUnsavedChanges(true);
      } else {
        setHasUnsavedChanges(false);
      }

      previousLineItemsRef.current = [...lineItemsAfterInventoryProcessing];

      // NEW: Sync Levies
      try {
        await base44.functions.invoke('syncLevies', {
          workOrderId: workOrder.id,
          lineItems: lineItemsToSave
        });
      } catch (levyError) {
        console.error('Failed to sync levies:', levyError);
      }

      if (showAlertOnSuccess) {
        alert('Work order saved successfully!');
        await refetchWorkOrder();
      }

    } catch (error) {
      console.error('=== SAVE: Error saving work order:', error);
      alert('Failed to save work order. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [workOrder, lineItems, systemSettings, invoiceConversionPhase, refetchWorkOrder, pendingReturns, setLineItems, mode]);

  const handleProcessAdvancePayment = useCallback(async (action, payload) => {
    if (!workOrder) {
      throw new Error('Work order data is not available');
    }

    try {
      if (action === 'add') {
        const newCustomerPaymentData = {
          customer_id: workOrder.customer_id,
          work_order_id: workOrder.id,
          amount: payload.amount,
          payment_method: payload.method,
          payment_date: payload.date,
          reference: payload.reference || '',
          notes: `Payment for RO ${workOrder.ro_number}`,
          deposited: false,
          gl_posted: false,
          ar_pmt: false,
          advance_pmt: payload.advance_pmt || false,
          invoice_number: workOrder.inv_number || ''
        };

        const createdPayment = await CustomerPayments.create(newCustomerPaymentData);

        let currentPayments = [];
        try {
          currentPayments = workOrder.payments ? JSON.parse(workOrder.payments) : [];
        } catch (parseError) {
          currentPayments = [];
        }

        const paymentForJson = {
          id: createdPayment.id,
          amount: createdPayment.amount,
          payment_method: createdPayment.payment_method,
          payment_date: createdPayment.payment_date,
          reference: createdPayment.reference,
          notes: createdPayment.notes,
          advance_pmt: createdPayment.advance_pmt || false
        };

        currentPayments.push(paymentForJson);

        const updatedPaymentsJson = JSON.stringify(currentPayments);

        await handleSave({
          payments: updatedPaymentsJson,
          amount_paid: currentPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        }, false);

      } else if (action === 'delete') {
        const paymentIdToDelete = payload.id;
        await CustomerPayments.delete(paymentIdToDelete);

        let currentPayments = [];
        try {
          currentPayments = workOrder.payments ? JSON.parse(workOrder.payments) : [];
        } catch (parseError) {
          currentPayments = [];
        }

        const filteredPayments = currentPayments.filter(p => p.id !== paymentIdToDelete);
        const updatedPaymentsJson = JSON.stringify(filteredPayments);

        await handleSave({
          payments: updatedPaymentsJson,
          amount_paid: filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        }, false);
      }
    } catch (error) {
      console.error(`Error processing payment ${action}:`, error);
      throw new Error(`Failed to ${action} payment: ${error.message}`);
    }
  }, [workOrder, handleSave]);

  const handleProcessInvoicePayment = useCallback(async (action, payload) => {
    if (!workOrder) {
      throw new Error('Work order data is not available');
    }

    try {
      if (action === 'add') {
        let newLineItems = [...lineItems];
        let pennyAdjustmentLineId = null;
        let creditCardFeeLineId = null;

        // Handle Penny Adjustment
        if (payload.penny_adjustment && payload.penny_adjustment !== 0) {
          // Find Penny Adjustment Other Charge
          const pennyAdjCharge = otherCharges.find(oc => oc.description === "Penny Adjustment");
          
          if (pennyAdjCharge) {
            const newLineItem = {
              id: crypto.randomUUID(), // Generate client-side ID
              is_other_charge: true,
              description: "Penny Adjustment",
              unit: 'ea',
              qty: 1,
              parts_ea: 0,
              labour: 0,
              oc_total: payload.penny_adjustment,
              total: payload.penny_adjustment,
              taxable: pennyAdjCharge.is_taxable === true,
              gl_account: pennyAdjCharge.gl_account,
              inventory_item_id: null,
              cost_ea: 0,
              hrs: 0,
              inventory_processed: false
            };
            newLineItems.push(newLineItem);
            pennyAdjustmentLineId = newLineItem.id;
            
            console.log("Added Penny Adjustment line item:", newLineItem);
          } else {
            console.warn("Penny Adjustment Other Charge not found. Proceeding without adjustment line.");
          }
        }

        // Handle Credit Card Fee
        if (payload.credit_card_fee && payload.credit_card_fee > 0) {
          // Find Credit Card Fee Other Charge
          const ccFeeCharge = otherCharges.find(oc => oc.description === "Credit Card Fee");
          
          if (ccFeeCharge) {
            const newLineItem = {
              id: crypto.randomUUID(), // Generate client-side ID
              is_other_charge: true,
              description: "Credit Card Fee (3%)",
              unit: 'ea',
              qty: 1,
              parts_ea: 0,
              labour: 0,
              oc_total: payload.credit_card_fee,
              total: payload.credit_card_fee,
              taxable: ccFeeCharge.is_taxable === true,
              gl_account: ccFeeCharge.gl_account,
              inventory_item_id: null,
              cost_ea: 0,
              hrs: 0,
              inventory_processed: false
            };
            newLineItems.push(newLineItem);
            creditCardFeeLineId = newLineItem.id;
            
            console.log("Added Credit Card Fee line item:", newLineItem);
          } else {
            console.warn("Credit Card Fee Other Charge not found. Proceeding without fee line.");
          }
        }

        const newCustomerPaymentData = {
          customer_id: workOrder.customer_id,
          work_order_id: workOrder.id,
          amount: payload.amount,
          payment_method: payload.method,
          payment_date: payload.date,
          notes: `Payment for Invoice ${workOrder.inv_number || workOrder.ro_number}`,
          deposited: false,
          gl_posted: false,
          ar_pmt: false,
          invoice_number: workOrder.inv_number || ''
        };
        
        if (payload.method === 'cheque') {
          newCustomerPaymentData.cheque_name = payload.cheque_name || '';
          newCustomerPaymentData.cheque_number = payload.cheque_number || '';
        }

        const createdPayment = await CustomerPayments.create(newCustomerPaymentData);

        let currentPayments = [];
        try {
          currentPayments = workOrder.payments ? JSON.parse(workOrder.payments) : [];
        } catch (parseError) {
          currentPayments = [];
        }

        const paymentForJson = {
          id: createdPayment.id,
          amount: createdPayment.amount,
          payment_method: createdPayment.payment_method,
          payment_date: createdPayment.payment_date,
          reference: createdPayment.reference,
          notes: createdPayment.notes
        };

        if (pennyAdjustmentLineId) {
          paymentForJson.penny_adjustment_line_item_id = pennyAdjustmentLineId;
          paymentForJson.penny_adjustment_amount = payload.penny_adjustment;
        }

        if (creditCardFeeLineId) {
          paymentForJson.credit_card_fee_line_item_id = creditCardFeeLineId;
          paymentForJson.credit_card_fee_amount = payload.credit_card_fee;
        }

        currentPayments.push(paymentForJson);

        const updatedPaymentsJson = JSON.stringify(currentPayments);
        const newTotalPaid = currentPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

        // Update state and save
        setLineItems(newLineItems);
        
        // Pass newLineItems as the 3rd argument (lineItemsOverride) to ensure handleSave uses the updated list
        // and performs all calculations (totals, tax, etc.) correctly based on it.
        await handleSave({
          payments: updatedPaymentsJson,
          amount_paid: newTotalPaid
        }, false, newLineItems);

      } else if (action === 'delete') {
        const paymentIdToDelete = payload.id;
        
        let currentPayments = [];
        try {
          currentPayments = workOrder.payments ? JSON.parse(workOrder.payments) : [];
        } catch (parseError) {
          currentPayments = [];
        }

        const paymentToDelete = currentPayments.find(p => p.id === paymentIdToDelete);
        
        // Handle Penny Adjustment Deletion
        let newLineItems = [...lineItems];
        if (paymentToDelete && paymentToDelete.penny_adjustment_line_item_id) {
          const lineIdToRemove = paymentToDelete.penny_adjustment_line_item_id;
          newLineItems = newLineItems.filter(item => item.id !== lineIdToRemove);
          console.log("Removed Penny Adjustment line item:", lineIdToRemove);
        }

        // Handle Credit Card Fee Deletion
        if (paymentToDelete && paymentToDelete.credit_card_fee_line_item_id) {
          const lineIdToRemove = paymentToDelete.credit_card_fee_line_item_id;
          newLineItems = newLineItems.filter(item => item.id !== lineIdToRemove);
          console.log("Removed Credit Card Fee line item:", lineIdToRemove);
        }

        await CustomerPayments.delete(paymentIdToDelete);

        const filteredPayments = currentPayments.filter(p => p.id !== paymentIdToDelete);
        const updatedPaymentsJson = JSON.stringify(filteredPayments);
        const newTotalPaid = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

        setLineItems(newLineItems);
        
        await handleSave({
          payments: updatedPaymentsJson,
          amount_paid: newTotalPaid
        }, false, newLineItems);
      }
    } catch (error) {
      console.error(`Error processing invoice payment ${action}:`, error);
      throw new Error(`Failed to ${action} invoice payment: ${error.message}`);
    }
  }, [workOrder, lineItems, otherCharges, handleSave]);

  const onConversionModalCancel = useCallback(async () => {
    try {
      await handleSave({ stage: 'work_order', converted: false }, false);
      setInvoiceConversionPhase(0);
      alert('Invoice conversion cancelled. Work order has been reverted to "Work Order" stage.');
    } catch (error) {
      console.error('Error reverting work order after cancellation:', error);
      setInvoiceConversionPhase(0);
      alert('Invoice conversion cancelled, but an error occurred during reversion. Please check the work order manually.');
    }
  }, [handleSave]);

  const onConversionModalSubmit = useCallback(async (data) => {
    try {
      if (invoiceConversionPhase === 1) {
        await handleSave({ odometer: data.odometer }, false);
        setInvoiceConversionPhase(2);
      } else if (invoiceConversionPhase === 2) {
        await handleSave({ description: data.description }, false);
        setInvoiceConversionPhase(3);
      } else if (invoiceConversionPhase === 3) {
        await handleSave({
          invoice_date: data.invoice_date
        }, false);
        setInvoiceConversionPhase(0);
      }
    } catch (error) {
      console.error('Error during conversion step submission:', error);
      alert('An error occurred while saving conversion data. Conversion cancelled.');
      onConversionModalCancel();
    }
  }, [invoiceConversionPhase, handleSave, onConversionModalCancel]);

  const handleConvertToInvoice = useCallback(async () => {
    if (!workOrder) return;

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

    if (workOrder.stage !== 'work_order') {
      alert('Only work orders in the "Work Order" stage can be converted to invoices.');
      return;
    }

    const confirmed = window.confirm('Convert to Invoice?');
    if (!confirmed) return;

    setInvoiceConversionPhase(1);
  }, [workOrder, lineItems]);

  const handleHeaderSaveClick = useCallback(async () => {
    if (saving) return;
    try {
      await handleSave({}, false);

      if (workOrder && currentUser && lockAcquiredRef.current) {
        await WorkOrder.update(workOrder.id, { LockedByUser: null });
        lockAcquiredRef.current = false;
      }

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

      setTimeout(() => {
        successMessage.remove();
        window.close();
      }, 1000);

    } catch (error) {
      alert(`Failed to save work order: ${error.message}`);
    }
  }, [handleSave, workOrder, currentUser, saving]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleHeaderSaveClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleHeaderSaveClick]);

  const handleCustomerUpdate = async (customerData) => {
    try {
      if (customer) {
        await handleSave({}, false);
        await Customer.update(customer.id, customerData);
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
        await handleSave({}, false);
        await Vehicle.update(vehicle.id, vehicleData);
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
      const updateData = { stage: newStage };
      
      if (newStage === 'work_order' && !workOrder.wo_date) {
        updateData.wo_date = format(new Date(), 'yyyy-MM-dd');
        
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
      setSelectedAppointmentForEdit(upcomingAppointment);
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
      if (workOrder && workOrder.id && currentUser && lockAcquiredRef.current) {
        await WorkOrder.update(workOrder.id, { LockedByUser: null });
        lockAcquiredRef.current = false;
      }
      navigate(createPageUrl(`WorkOrderView?id=${roNumber}`));
    } catch (error) {
      console.error('=== VIEW ONLY: Error releasing lock:', error);
      navigate(createPageUrl(`WorkOrderView?id=${roNumber}`));
    }
  };

  const handleConvertEstimate = async () => {
    if (!window.confirm("Convert this estimate to a Work Order? This will update inventory and place parts on order.")) return;
    
    setConverting(true);
    try {
      // First save any changes
      await handleSave({}, false);
      
      // Call backend to convert and process inventory
      const response = await base44.functions.invoke('convertEstimateToWorkOrder', {
        workOrderId: workOrder.id
      });
      
      if (response.data.success) {
        //alert("Estimate successfully converted to Work Order!"); // Optional: remove alert for smoother flow
        
        // Reload page to switch to Work Order mode
        window.location.href = `/WorkOrderEdit?id=${workOrder.ro_number}`;
      } else {
        alert(`Conversion failed: ${response.data.error}`);
      }
    } catch (err) {
      console.error("Conversion error:", err);
      alert("Failed to convert estimate.");
    } finally {
      setConverting(false);
    }
  };

  const handleSendClick = useCallback(async () => {
    // Save before opening send modal to ensure snapshot is created with latest data
    await handleSave({}, false);
    openModal('send');
  }, [handleSave, openModal]);

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

  if (isAlreadyOpenByMe) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full shadow-xl">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  Document Already Open
                </h2>
                <p className="text-lg text-slate-700">
                  You already have this {mode === 'estimate' ? 'Estimate' : 'Work Order'} open in another window or tab.
                </p>
                <p className="text-sm text-slate-600 mt-4">
                  Opening it here may cause data conflicts if you are editing it elsewhere.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                <Button
                  onClick={() => {
                    window.close();
                    // Fallback if window.close() fails
                    setTimeout(() => {
                      navigate(createPageUrl('WorkOrders'));
                    }, 100);
                  }}
                  variant="outline"
                >
                  <X className="w-4 h-4 mr-2" />
                  Close
                </Button>

                <Button
                  onClick={() => {
                    const viewUrl = createPageUrl(`WorkOrderView?id=${roNumber}`);
                    window.location.href = viewUrl;
                  }}
                  variant="outline"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View-Only
                </Button>

                <Button
                  onClick={() => {
                    setIsAlreadyOpenByMe(false);
                    setLockAcquired(true);
                    lockAcquiredRef.current = true;
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Anyway
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLockedByOtherUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full shadow-xl">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              </div>

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

  const getColorClasses = (color, isActive) => {
    const colorMap = {
      slate: isActive ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-200',
      gray: isActive ? 'bg-gray-700 text-white' : 'text-gray-600 hover:bg-gray-200',
      blue: isActive ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-100',
      green: isActive ? 'bg-green-600 text-white' : 'text-green-600 hover:bg-green-100',
      red: isActive ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-100',
      orange: isActive ? 'bg-orange-600 text-white' : 'text-orange-600 hover:bg-orange-100',
      yellow: isActive ? 'bg-yellow-600 text-white' : 'text-yellow-600 hover:bg-yellow-100',
      purple: isActive ? 'bg-purple-600 text-white' : 'text-purple-600 hover:bg-purple-100',
    };
    return colorMap[color?.toLowerCase()] || colorMap.slate;
  };

  const stages = [
    {
      key: 'estimate',
      label: 'Estimate',
      activeColor: 'bg-orange-500 text-white border-orange-600 font-bold',
      inactiveColor: 'text-orange-700 hover:bg-orange-100',
      disabled: workOrder?.stage === 'work_order' || workOrder?.stage === 'invoice' || workOrder?.stage === 'credit_invoice'
    },
    {
      key: 'work_order',
      label: 'Work Order',
      activeColor: 'bg-blue-600 text-white border-blue-700',
      inactiveColor: 'text-blue-700 hover:bg-blue-100',
      disabled: workOrder?.stage === 'invoice' || workOrder?.stage === 'credit_invoice',
      action: mode === 'estimate' ? handleConvertEstimate : undefined
    },
    {
      key: 'invoice',
      label: 'Invoice',
      activeColor: 'bg-green-600 text-white border-green-700',
      inactiveColor: 'text-green-700 hover:bg-green-100',
      disabled: workOrder?.stage === 'estimate'
    },
  ];

  return (
    <>
      <style>
        {`
          @media print {
            .screen-only-area {
              display: none !important;
            }
            .print-only-area {
              display: block !important;
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

      <div className="min-h-screen bg-slate-50 screen-only-area">
        <div className="bg-white border-b border-slate-200 px-6 py-3 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handlePrintDirect}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <Button variant="outline" onClick={handleSendClick}>
                  <Send className="w-4 h-4 mr-2" />
                  Send
                </Button>
              </div>

              <div className="w-px h-6 bg-slate-300"></div>

              <Button
                variant="outline"
                onClick={handleViewOnlyMode}
                className="bg-white"
              >
                <Eye className="w-4 h-4 mr-2" />
                View Only Mode
              </Button>

              <div className="w-px h-6 bg-slate-300"></div>

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

              <div className="w-px h-6 bg-slate-300"></div>

              <div className="flex items-center gap-4">
                  <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
                    {stages.map((stage, index) => (
                      <button
                        key={stage.key}
                        onClick={() => {
                          if (stage.disabled) return;
                          if (stage.action) {
                            stage.action();
                          } else {
                            handleStageChange(stage.key);
                          }
                        }}
                        disabled={stage.disabled && !stage.action}
                        className={`
                          px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200
                          ${workOrder?.stage === stage.key
                            ? stage.activeColor + ' shadow-sm'
                            : (stage.disabled && !stage.action)
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : stage.inactiveColor + ' bg-transparent'
                          }
                          ${index < stages.length ? 'mr-1' : ''}
                        `}
                      >
                        {stage.action && converting ? <Loader2 className="w-3 h-3 animate-spin mr-1 inline" /> : null}
                        {stage.label}
                      </button>
                    ))}

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

        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 sticky top-[69px] z-20 shadow-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  {workOrderStatuses.map(status => {
                    const isActive = workOrder?.status === status.name;
                    const colorClasses = getColorClasses(status.color, isActive);
                    return (
                      <Button
                        key={status.name}
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStatusChange(status.name)}
                        className={`transition-all duration-200 text-xs font-bold ${colorClasses}`}
                      >
                        {status.name}
                      </Button>
                    );
                  })}
                </div>

                <div className="w-px h-6 bg-slate-300"></div>

                <div className="flex items-center gap-3">
                  <div
                    onClick={() => openModal('workPRO')}
                    className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 px-2 py-1 rounded transition-colors"
                  >
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => openModal('appointmentsList')}
                className="p-2"
              >
                <CalendarDays className="w-5 h-5" />
              </Button>

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
              otherCharges={otherCharges}
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
              mode={mode} // Pass mode to WorkOrderForm
              shopSupplyRate={systemSettings.shop_supply_rate}
            />
          )}
        </div>
      </div>

      <div className="print-only-area" style={{ display: 'none' }}>
        {workOrder && (
          <WorkOrderReport
            workOrder={workOrder}
            customer={customer}
            vehicle={vehicle}
            lineItems={lineItems || []}
            wipLegal={wipLegal}
            defaultMessage={defaultMessage}
          />
        )}
      </div>

      {workOrder && (
        <>
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
                wipLegal={wipLegal}
                defaultMessage={defaultMessage}
              />
            </DialogContent>
          </Dialog>

          <SESEmailModal open={modals.send} onClose={() => closeModal('send')} workOrder={workOrder} customer={customer} />

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

          <WONotesModal
            open={modals.woNotes}
            onClose={() => closeModal('woNotes')}
            workOrder={workOrder}
            onUpdate={handleSave}
          />

          <OdometerPromptModal
            open={invoiceConversionPhase === 1}
            onClose={onConversionModalCancel}
            onSubmit={onConversionModalSubmit}
            workOrder={workOrder}
            workPROProject={workPROProject}
            mode="invoiceConversion"
            vehicle={vehicle}
          />

          <OdometerPromptModal
            open={showOdometerSimpleUpdateModal}
            onClose={() => setShowOdometerSimpleUpdateModal(false)}
            onSubmit={handleOdometerSimpleUpdateSubmit}
            workOrder={workOrder}
            workPROProject={workPROProject}
            mode="simpleUpdate"
            vehicle={vehicle}
          />

          <InvoiceDescriptionModal
            open={invoiceConversionPhase === 2}
            onClose={onConversionModalCancel}
            onSubmit={onConversionModalSubmit}
            workOrder={workOrder}
          />

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

          <WorkOrderPdfModal
            open={modals.pdf}
            onClose={() => closeModal('pdf')}
            workOrder={workOrder}
            customer={customer}
            vehicle={vehicle}
            lineItems={lineItems}
          />
        </>
      )}
    </>
  );
}