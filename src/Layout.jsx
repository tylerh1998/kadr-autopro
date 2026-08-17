import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import {
  FileText,
  Users,
  Car,
  Package,
  Calendar,
  DollarSign,
  CreditCard,
  UserCheck,
  Settings,
  PlusCircle,
  List,
  Search,
  History,
  Receipt,
  Plus,
  RotateCcw,
  CalendarPlus,
  Truck,
  BookOpen,
  Wallet,
  Landmark,
  University,
  BookCheck,
  Percent,
  BookCopy,
  CalendarClock,
  Calculator,
  TrendingUp,
  Network,
  MailCheck,
  Send,
  BarChart3,
  LogOut,
  Mail,
  Briefcase,
  Clock,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  Shield,
  User as UserIcon,
  AlertCircle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

import { createPageUrl } from './utils';
import ReportModal from './components/reports/ReportModal';
import FindPartModal from './components/work-orders/FindPartModal';
import NewCustomerModal from './components/customers/NewCustomerModal';
import NewVehicleModal from './components/vehicles/NewVehicleModal';
import OpenROModal from './components/work-orders/OpenROModal';
import NewWorkOrderModal from './components/work-orders/NewWorkOrderModal';
import TechClockStatusModal from './components/work-orders/TechClockStatusModal';
import GlobalClockInModal from './components/work-orders/GlobalClockInModal';
import { TechClockStatusProvider, useTechClockStatus } from './components/context/TechClockStatusContext';
import { createworkorderdata } from '@/api/workOrderFunctions';
import { SupplierLockProvider, useSupplierLock } from './components/context/SupplierLockContext';
import ReportIssueModal from './components/layout/ReportIssueModal';

function LayoutContent({ children, currentPageName }) {
  const [showFindPartModal, setShowFindPartModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [showNewVehicleModal, setShowNewVehicleModal] = useState(false);
  const [showOpenROModal, setShowOpenROModal] = useState(false);
  const [showNewWorkOrderModal, setShowNewWorkOrderModal] = useState(false);
  const [reportType, setReportType] = useState('');
  const { isOpen: showTechClockStatusModal, openTechClockStatusModal, closeTechClockStatusModal } = useTechClockStatus();
  const [showGlobalClockInModal, setShowGlobalClockInModal] = useState(false);
  const [showReportIssueModal, setShowReportIssueModal] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { lockState, clearSupplierLock } = useSupplierLock();
  const { logout, employee, updateEmployeePrefs, user } = useAuth();

  const [isClockedIn, setIsClockedIn] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentTimeRecord, setCurrentTimeRecord] = useState(null);
  const [isEmployee, setIsEmployee] = useState(true);
  const [workProEmployee, setWorkProEmployee] = useState(null);
  const [clockLoading, setClockLoading] = useState(false);

  const getCurrentMountainTimeISO = () => moment.tz('America/Edmonton').toISOString();

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(null);

  // Dropdown hover timeout
  const [hoverTimeout, setHoverTimeout] = useState(null);

  // Dark mode state
  const [darkMode, setDarkMode] = useState(false);
  const [isTraining, setIsTraining] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Fetch System Settings to check for training environment
        const { data: settings, error: settingsError } = await supabase.from('SystemSettings').select('*');
        if (settingsError) throw settingsError;
        if (settings && settings.length > 0 && settings[0].training_enviro) {
          setIsTraining(true);
        }
      } catch (error) {
        console.error("Failed to fetch settings", error);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (employee?.dark_mode) {
      setDarkMode(true);
    }
  }, [employee]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleToggleDarkMode = async () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    const { error } = await updateEmployeePrefs({ dark_mode: newDarkMode });
    if (error) console.error("Failed to save dark mode preference", error);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkClockStatus = async () => {
      if (!employee) return;
      setClockLoading(true);

      try {
        let workproEmployeeRecord = null;

        if (employee?.autopro_user_id) {
          const { data: byUserId, error: byUserIdError } = await supabase
            .from('Employee')
            .select('*')
            .eq('autopro_user_id', employee.autopro_user_id);
          if (byUserIdError) console.error('Employee lookup by autopro_user_id failed', byUserIdError);
          workproEmployeeRecord = Array.isArray(byUserId) ? byUserId[0] : null;
        }

        if (!workproEmployeeRecord && employee?.email) {
          const { data: byEmail, error: byEmailError } = await supabase
            .from('Employee')
            .select('*')
            .eq('email', employee.email);
          if (byEmailError) console.error('Employee lookup by email failed', byEmailError);
          workproEmployeeRecord = Array.isArray(byEmail) ? byEmail[0] : null;
        }

        const employeeName = workproEmployeeRecord?.full_name || null;
        const employeeExists = !!employeeName;

        setIsEmployee(employeeExists);
        setWorkProEmployee(workproEmployeeRecord || null);

        if (!employeeExists) {
          setIsClockedIn(false);
          setCurrentTimeRecord(null);
          return;
        }

        const { data: records, error: recordsError } = await supabase
          .from('TimeRecord')
          .select('*')
          .eq('employee_name', employeeName)
          .eq('status', 'clocked_in');
        if (recordsError) console.error('TimeRecord lookup failed', recordsError);

        const activeRecord = Array.isArray(records)
          ? records.find((record) => record.status === 'clocked_in') || null
          : null;

        setCurrentTimeRecord(activeRecord);
        setIsClockedIn(!!activeRecord);
      } catch (error) {
        console.warn('Clock status check unavailable:', error.message || 'Network error');
        setIsClockedIn(false);
        setCurrentTimeRecord(null);
        setIsEmployee(false);
        setWorkProEmployee(null);
      } finally {
        setClockLoading(false);
      }
    };

    if (employee) {
      checkClockStatus();
    }
  }, [employee]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'F4') {
        event.preventDefault();
        setShowOpenROModal(true);
      }
      if (event.key === 'F3') {
        event.preventDefault();
        setShowNewWorkOrderModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handlePayrollClick = (e) => {
    // If paypro_user is true, allow default navigation to /Payroll
    if (employee?.paypro_user === true) {
      return;
    }

    // If false or null/undefined, redirect to external WorkPRO TimeRecords
    e.preventDefault();
    window.location.href = 'https://workpro.kensauto.ca/TimeRecords';
  };

  const handleClockToggle = async () => {
    if (!employee || !isEmployee || clockLoading || !workProEmployee?.full_name) return;

    setClockLoading(true);

    try {
      const { data: latestRecords, error: latestRecordsError } = await supabase
        .from('TimeRecord')
        .select('*')
        .eq('employee_name', workProEmployee.full_name)
        .eq('status', 'clocked_in');
      if (latestRecordsError) console.error('TimeRecord lookup failed', latestRecordsError);

      const activeRecord = Array.isArray(latestRecords)
        ? latestRecords.find((record) => record.status === 'clocked_in') || null
        : null;

      setCurrentTimeRecord(activeRecord);
      setIsClockedIn(!!activeRecord);

      if (activeRecord) {
        const clockOutTime = getCurrentMountainTimeISO();
        const totalHours = Math.round(((new Date(clockOutTime) - new Date(activeRecord.clock_in_time)) / 3600000) * 100) / 100;

        const { error: updateError } = await supabase
          .from('TimeRecord')
          .update({
            clock_out_time: clockOutTime,
            total_hours: totalHours,
            status: 'clocked_out',
            updated_date: new Date().toISOString()
          })
          .eq('id', activeRecord.id);
        if (updateError) console.error('TimeRecord update failed', updateError);

        setIsClockedIn(false);
        setCurrentTimeRecord(null);
      } else {
        const clockInTime = getCurrentMountainTimeISO();

        const { data: createdRecord, error: createError } = await supabase
          .from('TimeRecord')
          .insert({
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            created_date: new Date().toISOString(),
            created_by: employee?.email,
            created_by_id: employee?.autopro_user_id,
            employee_name: workProEmployee.full_name,
            clock_in_time: clockInTime,
            status: 'clocked_in',
            total_hours: 0,
            pto_hours: 0,
            stat_hours: 0
          })
          .select()
          .single();
        if (createError) console.error('TimeRecord create failed', createError);
        setIsClockedIn(true);
        setCurrentTimeRecord(createdRecord || null);
      }
    } catch (error) {
      console.error('Error toggling clock:', error);
      alert('Error updating time record. Please try again.');
    } finally {
      setClockLoading(false);
    }
  };

  const handleGlobalClockInSuccess = (newRecord) => {
    setIsClockedIn(true);
    setCurrentTimeRecord(newRecord);
  };

  const handleMouseEnter = (itemTitle) => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setHoveredItem(itemTitle);
  };

  const handleMouseLeave = () => {
    const timeout = setTimeout(() => {
      setHoveredItem(null);
    }, 300);
    setHoverTimeout(timeout);
  };

  const handleLockedNavigation = async (targetUrl) => {
    const isOnSupplierTx = location.pathname.startsWith('/SupplierTx');
    const hasActiveSupplierLock = isOnSupplierTx && lockState?.isActive && lockState?.supplierId;

    const proceedToTarget = () => {
      clearSupplierLock();
      navigate(targetUrl);
    };

    if (!hasActiveSupplierLock) {
      proceedToTarget();
      return;
    }

    if (lockState.hasUnsavedChanges) {
      const userWantsToSave = window.confirm(`You have unsaved changes for ${lockState.supplierName || 'this supplier'}. Click "OK" to save and leave, or "Cancel" for more options.`);
      if (userWantsToSave) {
        const saveSuccessful = await lockState.saveBeforeLeave?.();
        if (saveSuccessful) {
          await lockState.releaseLock?.();
          proceedToTarget();
        }
        return;
      }

      const discardChanges = window.confirm(`Discard changes and leave ${lockState.supplierName || 'this supplier'}? Click "OK" to leave without saving, or "Cancel" to stay on this page.`);
      if (!discardChanges) return;
    }

    await lockState.releaseLock?.();
    proceedToTarget();
  };

  const handleMenuClick = (action) => {
    console.log('🎯 handleMenuClick called with action:', action);
    console.log('📍 Current location:', window.location.href);
    console.log('📍 Current pathname:', window.location.pathname);

    setHoveredItem(null);
    setIsMobileMenuOpen(false);
    setMobileDropdownOpen(null);

    switch (action) {
      case 'openNewWorkOrderModal':
        console.log('✅ Opening New Work Order Modal');
        setShowNewWorkOrderModal(true);
        break;
      case 'openSearchWIPModal':
        console.log('✅ Opening Search WIP Modal');
        setShowOpenROModal(true);
        break;
      case 'FindPartModal':
        console.log('✅ Opening Find Part Modal');
        setShowFindPartModal(true);
        break;
      case 'createCustomer':
        console.log('✅ Opening Create Customer Modal');
        setShowNewCustomerModal(true);
        break;
      case 'addVehicle':
        console.log('✅ Opening Add Vehicle Modal');
        setShowNewVehicleModal(true);
        break;
      case 'showInventoryReports':
        console.log('✅ Opening Inventory Reports Modal');
        setReportType('inventory');
        setShowReportModal(true);
        break;
      case 'showFinancialReports':
        console.log('✅ Opening Financial Reports Modal');
        setReportType('financial');
        setShowReportModal(true);
        break;
      case 'showManagementReports':
        console.log('✅ Opening Management Reports Modal');
        setReportType('management');
        setShowReportModal(true);
        break;
      case 'showPayrollReports':
        console.log('✅ Opening Payroll Reports Modal');
        setReportType('payroll');
        setShowReportModal(true);
        break;
      case 'showAccountingReports':
        console.log('✅ Opening Accounting Reports Modal');
        setReportType('accounting');
        setShowReportModal(true);
        break;
      case 'openFinancialDashboard':
        console.log('✅ Opening Financial Dashboard');
        window.open(createPageUrl('FinancialDashboard'), '_blank', 'width=1400,height=900');
        break;
      default:
        console.log('⚠️ Unknown action:', action);
    }
  };

  const navigationItems = [
    {
      title: "WIP",
      icon: FileText,
      defaultUrl: createPageUrl("WorkOrders"),
      activePaths: ["/WorkOrders", "/WorkOrderEdit", "/WorkOrderView", "/CreditInvoice", "/InvoiceConversion"],
      dropdown: [
        { title: "List", url: createPageUrl("WorkOrders"), icon: List },
        { title: "Search WIP", action: "openSearchWIPModal", icon: Search },
        { title: "Find Part/Serial #", action: "FindPartModal", icon: Search },
        { title: "Reports", action: "showManagementReports", icon: BarChart3 },
      ]
    },
    {
      title: "Customers",
      icon: Users,
      defaultUrl: createPageUrl("Customers"),
      activePaths: ["/Customers", "/EmailLog", "/CustomerARSummary", "/CustomerARTransactions"],
      dropdown: [
        { title: "Create", action: "createCustomer", icon: UserCheck },
        { title: "List", url: createPageUrl("Customers"), icon: List },
        { title: "Account Receivables", url: createPageUrl("CustomerARSummary"), icon: Receipt },
        { title: "Email/Text Log", url: createPageUrl("EmailLog"), icon: Mail },
      ]
    },
    {
      title: "Vehicles",
      icon: Car,
      defaultUrl: createPageUrl("Vehicles"),
      activePaths: ["/Vehicles"],
      dropdown: [
        { title: "Add", action: "addVehicle", icon: PlusCircle },
        { title: "List", url: createPageUrl("Vehicles"), icon: List },
      ]
    },
    {
      title: "Inventory",
      icon: Package,
      defaultUrl: createPageUrl("InventoryList"),
      activePaths: ["/InventoryList", "/InventoryReturns", "/InventoryAdd"],
      dropdown: [
        { title: "List", url: createPageUrl("InventoryList"), icon: List },
        { title: "Add", url: createPageUrl("InventoryAdd"), icon: Plus },
        { title: "Returns", url: createPageUrl("InventoryReturns"), icon: RotateCcw },
        { title: "Reports", action: "showInventoryReports", icon: BarChart3 },
      ]
    },
    {
      title: "Scheduling",
      icon: Calendar,
      url: createPageUrl("Schedule"),
      activePaths: ["/Schedule"],
    },
    {
      title: "Suppliers",
      icon: DollarSign,
      defaultUrl: createPageUrl("Suppliers"),
      activePaths: ["/Suppliers", "/SupplierTx", "/APSummary", "/LinesOfCredit", "/SupplierTxView"],
      dropdown: [
        { title: "Suppliers", url: createPageUrl("Suppliers"), icon: Truck },
        { title: "AP Summary", url: createPageUrl("APSummary"), icon: BookOpen },
        { title: "Lines of Credit", url: createPageUrl("LinesOfCredit"), icon: Landmark },
      ]
    },
    (() => {
      const accountingBase = {
        title: "Accounting",
        icon: CreditCard,
        defaultUrl: createPageUrl("CashDrawer"),
        activePaths: ["/CashDrawer", "/ChequeRegister", "/Taxes", "/JournalEntries", "/ChartOfAccounts", "/Bank", "/FiscalPeriods", "/Reconcile", "/ReconcileReport", "/ChequeWriter", "/PLReport", "/BalanceSheet", "/FinancialDashboard", "/GLAcct", "/CashFlow"],
      };

      if (employee?.autopro_access_lvl === 'lvl3_user') {
        return {
          ...accountingBase,
          dropdown: [
            { title: "Cash Drawer", url: createPageUrl("CashDrawer"), icon: Wallet },
            { title: "Bank Accounts", url: createPageUrl("Bank"), icon: University },
            { title: "Cash Flow", url: createPageUrl("CashFlow"), icon: TrendingUp },
            { title: "Accounting", action: "showAccountingReports", icon: Calculator },
            { title: "Reports", action: "openFinancialDashboard", icon: BarChart3 },
          ]
        };
      } else if (employee?.accts_pay_access === true) {
        return {
          ...accountingBase,
          dropdown: [
            { title: "Cash Drawer", url: createPageUrl("CashDrawer"), icon: Wallet },
            { title: "Cash Flow", url: createPageUrl("CashFlow"), icon: TrendingUp },
          ]
        };
      } else {
        return {
          title: "Accounting",
          icon: CreditCard,
          url: createPageUrl("CashDrawer"),
          activePaths: ["/CashDrawer"],
        };
      }
    })(),
    {
      title: "Payroll",
      icon: UserCheck,
      url: createPageUrl("Payroll"),
      activePaths: ["/Payroll", "/WorkPro"],
    },
    {
      title: "Setup",
      url: createPageUrl("Setup"),
      icon: Settings,
      activePaths: ["/Setup"],
    },
  ];

  const handleLogout = async () => {
    try {
      await logout();
      window.location.reload();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const getUserInitials = (fullName) => {
    if (!fullName) return "?";
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const toggleMobileDropdown = (itemTitle) => {
    setMobileDropdownOpen(prev => prev === itemTitle ? null : itemTitle);
  };

  const handleMobileLinkClick = () => {
    setIsMobileMenuOpen(false);
    setMobileDropdownOpen(null);
  };

  const pagesWithoutNavbar = [
    'WorkOrderEdit',
    'EstimateEdit',
    'WorkOrderView',
    'CreditInvoice',
    'InvoiceConversion',
    'GLAcct',
    'WorkPROView',
    'StockReorderReport',
    'GeneralLedger',
    'GLJournal',
    'FinancialDashboard',
    'InventoryValuation',
    'PLReport',
    'ChartOfAccounts',
    'BalanceSheet',
    'LankarWOView'
  ];

  if (pagesWithoutNavbar.includes(currentPageName)) {
    return (
      <div className="min-h-screen bg-background">
        <main>{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="no-print bg-white dark:bg-slate-950 shadow-sm border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
        {isTraining && (
          <div className="bg-orange-500 text-white text-center py-1 text-sm font-bold shadow-inner">
            Test Version of AutoPRO. No changes in this application will affect the live database.
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left: Logo, AutoPRO, and Mobile Menu Button */}
            <div className="flex items-center gap-4">
              <div
                onClick={() => {
                  openTechClockStatusModal();
                }}
                className="flex items-center cursor-pointer"
              >
                <img src="https://hbcrwkmgsazqrvsrmxyr.supabase.co/storage/v1/object/public/KADR/KADRLogoOnly.jpg" alt="Logo" className="h-10 dark:hidden" />
                <img src="/dark_logo.png" alt="Logo" className="h-10 hidden dark:block" />
              </div>

              <div
                onClick={() => {
                  handleLockedNavigation(createPageUrl("Home"));
                }}
                className="flex flex-col justify-center px-3 py-2 rounded-lg transition-all duration-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <div className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  AutoPRO
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400 leading-tight">
                  Ken's Auto
                </div>
              </div>

              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Toggle mobile menu"
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6 text-slate-700 dark:text-slate-300" />
                ) : (
                  <Menu className="w-6 h-6 text-slate-700 dark:text-slate-300" />
                )}
              </button>
            </div>

            {/* Center: Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-2">
              {navigationItems.map((item) => (
                <div key={item.title} className="relative">
                  {item.dropdown ? (
                    <div
                      className="relative"
                      onMouseEnter={() => handleMouseEnter(item.title)}
                      onMouseLeave={handleMouseLeave}
                    >
                      {(() => {
                        const isActive = item.activePaths && item.activePaths.some(path => location.pathname.startsWith(path));
                        return (
                          <div
                            onClick={(e) => {
                              console.log('🔗 Dropdown parent link clicked:', {
                                title: item.title,
                                defaultUrl: item.defaultUrl,
                                currentLocation: window.location.href
                              });
                              handleLockedNavigation(item.defaultUrl);
                            }}
                            className={`flex flex-col items-center gap-1 px-3 py-2 transition-colors duration-200 cursor-pointer rounded-md ${isActive
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                              }`}
                          >
                            <item.icon className="w-5 h-5" />
                            <span className="text-sm font-medium">{item.title}</span>
                          </div>
                        );
                      })()}

                      {hoveredItem === item.title && (
                        <div
                          className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 w-56 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 py-2 z-50"
                          onMouseEnter={() => handleMouseEnter(item.title)}
                          onMouseLeave={handleMouseLeave}
                        >
                          {item.dropdown.map((subItem) => (
                            <div key={subItem.title}>
                              {subItem.url ? (
                                <div
                                  onClick={(e) => {
                                    console.log('🔗 Dropdown item clicked:', {
                                      title: subItem.title,
                                      url: subItem.url,
                                      currentLocation: window.location.href
                                    });
                                    handleLockedNavigation(subItem.url);
                                  }}
                                  className="flex items-center gap-3 px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/50 hover:text-blue-700 dark:hover:text-blue-400 transition-colors cursor-pointer"
                                >
                                  <subItem.icon className="w-4 h-4" />
                                  {subItem.title}
                                </div>
                              ) : (
                                <div
                                  onClick={() => handleMenuClick(subItem.action)}
                                  className="flex items-center gap-3 px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/50 hover:text-blue-700 dark:hover:text-blue-400 transition-colors cursor-pointer"
                                >
                                  <subItem.icon className="w-4 h-4" />
                                  {subItem.title}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    (() => {
                      const isActive = item.activePaths && item.activePaths.some(path => location.pathname.startsWith(path));
                      return (
                        <div
                          onClick={(e) => {
                            console.log('🔗 Direct nav item clicked:', {
                              title: item.title,
                              url: item.url,
                              currentLocation: window.location.href
                            });
                            if (item.title === 'Payroll') {
                              handlePayrollClick(e);
                              if (!e.defaultPrevented) {
                                handleLockedNavigation(item.url);
                              }
                            } else {
                              window.location.href = item.url;
                            }
                          }}
                          className={`flex flex-col items-center gap-1 px-3 py-2 transition-colors duration-200 cursor-pointer rounded-md ${isActive
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                        >
                          <item.icon className="w-5 h-5" />
                          <span className="text-sm font-medium">{item.title}</span>
                        </div>
                      );
                    })()
                  )}
                </div>
              ))}
            </nav>

            {/* Right: Time Clock and User actions */}
            <div className="flex items-center gap-3">
              {/* Time Clock */}
              <button
                onClick={handleClockToggle}
                disabled={!isEmployee || clockLoading}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ${!isEmployee || clockLoading
                    ? 'bg-blue-600 text-white opacity-90 cursor-not-allowed'
                    : isClockedIn
                      ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60'
                      : 'bg-green-600 dark:bg-green-700 text-white hover:bg-green-700 dark:hover:bg-green-600 shadow-sm'
                  }`}
              >
                {clockLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Clock className="w-5 h-5" />
                )}
                <div className="flex flex-col items-start">
                  <span className={`text-xs ${isClockedIn || !isEmployee || clockLoading ? 'font-medium' : 'font-bold'}`}>
                    {clockLoading ? 'Checking...' : !isEmployee ? 'Unavailable' : (isClockedIn ? 'Clock Out' : 'Clock In')}
                  </span>
                  {!clockLoading && isEmployee && (
                    <span className="text-xs opacity-90">
                      {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="focus:outline-none">
                    <Avatar>
                      <AvatarFallback className="bg-slate-200 text-slate-700 font-bold">
                        {getUserInitials(employee?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild className="focus:bg-slate-50 dark:focus:bg-slate-800 cursor-pointer !p-0">
                    <a href="https://my.kensauto.ca" className="flex items-center gap-3 w-full p-3 select-none">
                      <Avatar className="h-9 w-9 border border-slate-200">
                        <AvatarFallback className="bg-[#1c2c54] text-white">
                          <UserIcon className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col text-left gap-1">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-none">
                          {employee?.full_name || 'User Profile'}
                        </span>
                        <span className="text-xs font-normal text-slate-500 dark:text-slate-400 leading-none">
                          {employee?.admin === true ? "Program Administrator" :
                            employee?.autopro_access_lvl === 'lvl3_user' ? "Executive Access" :
                              employee?.autopro_access_lvl === 'lvl2_user' ? "Supervisor Access" :
                                "Standard Access"}
                        </span>
                        <span className="text-[11px] font-medium text-[#1fa291] leading-none mt-0.5">
                          Manage Account &rarr;
                        </span>
                      </div>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href="https://workpro.kensauto.ca" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                      <Briefcase className="mr-2 h-4 w-4" />
                      <span>KADR WorkPRO</span>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="https://p3plzcpnl507860.prod.phx3.secureserver.net:2096/" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                      <Mail className="mr-2 h-4 w-4" />
                      <span>KADR Email</span>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="https://paypro.kensauto.ca" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                      <DollarSign className="mr-2 h-4 w-4" />
                      <span>KADR PayPRO</span>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="https://registry-pos-tracker-b5793593.base44.app/" target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                      <FileText className="mr-2 h-4 w-4" />
                      <span>Registries POS</span>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleToggleDarkMode} className="cursor-pointer">
                    {darkMode ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                    <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowReportIssueModal(true)} className="cursor-pointer">
                    <AlertCircle className="mr-2 h-4 w-4" />
                    <span>Report Issue</span>
                  </DropdownMenuItem>
                  {employee?.admin === true && (
                    <>
                      <DropdownMenuItem onClick={() => window.location.href = createPageUrl('Admin')} className="cursor-pointer">
                        <Shield className="mr-2 h-4 w-4" />
                        <span>Admin Dashboard</span>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer bg-red-600 text-white font-bold focus:bg-red-700 focus:text-white">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="no-print lg:hidden fixed top-16 left-0 w-full bg-white dark:bg-slate-950 shadow-lg z-30 overflow-y-auto h-[calc(100vh-4rem)] border-t border-slate-200 dark:border-slate-800">
          <nav className="py-4">
            {navigationItems.map((item) => (
              <div key={item.title} className="border-b border-slate-100">
                {item.dropdown ? (
                  <>
                    {(() => {
                      const isActive = item.activePaths && item.activePaths.some(path => location.pathname.startsWith(path));
                      return (
                        <button
                          onClick={() => toggleMobileDropdown(item.title)}
                          className={`w-full flex items-center justify-between px-6 py-4 transition-colors ${isActive
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <item.icon className="w-5 h-5" />
                            <span className="font-medium">{item.title}</span>
                          </div>
                          {mobileDropdownOpen === item.title ? (
                            <ChevronDown className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          ) : (
                            <ChevronRight className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          )}
                        </button>
                      );
                    })()}

                    {mobileDropdownOpen === item.title && (
                      <div className="bg-slate-50 py-2">
                        {item.dropdown.map((subItem) => (
                          <div key={subItem.title}>
                            {subItem.url ? (
                              <div
                                onClick={() => {
                                  handleMobileLinkClick();
                                  handleLockedNavigation(subItem.url);
                                }}
                                className="flex items-center gap-3 px-12 py-3 text-slate-600 hover:text-blue-700 hover:bg-white transition-colors cursor-pointer"
                              >
                                <subItem.icon className="w-4 h-4" />
                                {subItem.title}
                              </div>
                            ) : (
                              <button
                                onClick={() => handleMenuClick(subItem.action)}
                                className="w-full text-left flex items-center gap-3 px-12 py-3 text-slate-600 hover:text-blue-700 hover:bg-white transition-colors"
                              >
                                <subItem.icon className="w-4 h-4" />
                                {subItem.title}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  (() => {
                    const isActive = item.activePaths && item.activePaths.some(path => location.pathname.startsWith(path));
                    return (
                      <div
                        onClick={(e) => {
                          if (item.title === 'Payroll') {
                            handlePayrollClick(e);
                            if (!e.defaultPrevented) {
                              handleMobileLinkClick();
                              handleLockedNavigation(item.url);
                            }
                          } else {
                            handleMobileLinkClick();
                            window.location.href = item.url;
                          }
                        }}
                        className={`flex items-center gap-3 px-6 py-4 transition-colors cursor-pointer ${isActive
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-700 hover:bg-slate-50'
                          }`}
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.title}</span>
                      </div>
                    );
                  })()
                )}
              </div>
            ))}
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Modals */}

      <FindPartModal
        open={showFindPartModal}
        onClose={() => setShowFindPartModal(false)}
        currentUser={employee}
      />

      <NewCustomerModal
        open={showNewCustomerModal}
        onClose={() => setShowNewCustomerModal(false)}
      />

      <NewVehicleModal
        open={showNewVehicleModal}
        onClose={() => setShowNewVehicleModal(false)}
      />

      <ReportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        reportType={reportType}
        currentUser={employee}
      />

      <OpenROModal
        open={showOpenROModal}
        onClose={() => setShowOpenROModal(false)}
      />

      <NewWorkOrderModal
        open={showNewWorkOrderModal}
        onClose={() => setShowNewWorkOrderModal(false)}
        onCreateWorkOrder={async (workOrderData) => {
          try {
            const response = await createworkorderdata({ data: workOrderData });
            const newWorkOrder = response.data?.data;
            const pageName = newWorkOrder?.stage === 'estimate' ? "EstimateEdit" : "WorkOrderEdit";
            const url = createPageUrl(pageName) + "?id=" + newWorkOrder.ro_number;

            if (employee?.OpenNewWindow === false) {
              window.location.href = url;
            } else {
              const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
              window.open(url, '_blank', windowFeatures);
            }
          } catch (error) {
            console.error("Failed to create work order:", error);
            alert("Failed to create work order. Please try again.");
          }
        }}
      />

      <TechClockStatusModal
        open={showTechClockStatusModal}
        onClose={closeTechClockStatusModal}
      />

      <GlobalClockInModal
        open={showGlobalClockInModal}
        onClose={() => setShowGlobalClockInModal(false)}
        user={employee}
        onClockIn={handleGlobalClockInSuccess}
      />

      <ReportIssueModal
        isOpen={showReportIssueModal}
        onClose={() => setShowReportIssueModal(false)}
        user={user}
        currentEmployeeData={employee}
        isGloballyClockedIn={isClockedIn}
      />
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <TechClockStatusProvider>
      <SupplierLockProvider>
        <LayoutContent children={children} currentPageName={currentPageName} />
      </SupplierLockProvider>
    </TechClockStatusProvider>
  );
}