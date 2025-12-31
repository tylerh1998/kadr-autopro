import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { User as UserEntity } from '@/entities/User';
import { base44 } from '@/api/base44Client';
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
  Shield
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
import TechClockStatusModal from './components/work-orders/TechClockStatusModal';
import GlobalClockInModal from './components/work-orders/GlobalClockInModal';
import { TechClockStatusProvider, useTechClockStatus } from './components/context/TechClockStatusContext';

function LayoutContent({ children, currentPageName }) {
  const [showFindPartModal, setShowFindPartModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [showNewVehicleModal, setShowNewVehicleModal] = useState(false);
  const [showOpenROModal, setShowOpenROModal] = useState(false);
  const [reportType, setReportType] = useState('');
  const { isOpen: showTechClockStatusModal, openTechClockStatusModal, closeTechClockStatusModal } = useTechClockStatus();
  const [showGlobalClockInModal, setShowGlobalClockInModal] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [user, setUser] = useState(null);
  const location = useLocation();

  const [isClockedIn, setIsClockedIn] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastTimeRecord, setLastTimeRecord] = useState(null);
  const [isEmployee, setIsEmployee] = useState(true);
  const [workProName, setWorkProName] = useState(null);

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(null);

  // Dropdown hover timeout
  const [hoverTimeout, setHoverTimeout] = useState(null);

  // Dark mode state
  const [darkMode, setDarkMode] = useState(false);
  const [isTraining, setIsTraining] = useState(false);

  useEffect(() => {
    const fetchUserAndSettings = async () => {
      try {
        const currentUser = await UserEntity.me();
        setUser(currentUser);
        // Load dark mode preference from user data
        if (currentUser?.dark_mode) {
          setDarkMode(true);
        }

        // Fetch System Settings to check for training environment
        const settings = await base44.entities.SystemSettings.list();
        if (settings && settings.length > 0 && settings[0].training_enviro) {
          setIsTraining(true);
        }
      } catch (error) {
        console.error("Failed to fetch user or settings", error);
      }
    };
    fetchUserAndSettings();
  }, []);

  const handleToggleDarkMode = async () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    try {
      await base44.auth.updateMe({ dark_mode: newDarkMode });
    } catch (error) {
      console.error("Failed to save dark mode preference", error);
    }
  };

  const handleToggleOpenNewWindow = async () => {
    const newOpenNewWindow = !user?.OpenNewWindow;
    try {
      await base44.auth.updateMe({ OpenNewWindow: newOpenNewWindow });
      setUser({ ...user, OpenNewWindow: newOpenNewWindow });
    } catch (error) {
      console.error("Failed to save OpenNewWindow preference", error);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkClockStatus = async () => {
      if (!user) return;

      try {
        // Check if user is an employee in WorkPro
        let empName = user.full_name;
        let isEmp = false;

        // Try by email first
        if (user.email) {
          const empCheck = await base44.functions.invoke('workProProxy', {
            entityName: 'Employee',
            method: 'filter',
            params: { user_email: user.email }
          });
          
          if (empCheck.data.success && empCheck.data.data && empCheck.data.data.length > 0) {
            isEmp = true;
            empName = empCheck.data.data[0].full_name;
          }
        }

        // Fallback to name if not found by email
        if (!isEmp && user.full_name) {
          const empCheckName = await base44.functions.invoke('workProProxy', {
            entityName: 'Employee',
            method: 'filter',
            params: { full_name: user.full_name }
          });

          if (empCheckName.data.success && empCheckName.data.data && empCheckName.data.data.length > 0) {
            isEmp = true;
            empName = empCheckName.data.data[0].full_name;
          }
        }

        setIsEmployee(isEmp);
        setWorkProName(empName);

        if (!isEmp) {
            setIsClockedIn(false);
            setLastTimeRecord(null);
            return;
        }

        const response = await base44.functions.invoke('workProProxy', {
          entityName: 'TimeRecord',
          method: 'filter',
          params: {
            employee_name: empName,
            status: 'active'
          }
        });

        if (response.data.success) {
          const data = response.data.data;
          const records = Array.isArray(data) ? data : (data?.records || []);
          
          const activeRecord = records.find(record => record.clock_in_time && !record.clock_out_time);
          
          if (activeRecord) {
            setIsClockedIn(true);
            setLastTimeRecord(activeRecord);
          } else {
            setIsClockedIn(false);
            setLastTimeRecord(null);
          }
        } else {
          console.warn(`Could not fetch clock status: ${response.status} ${response.statusText}`);
          setIsClockedIn(false);
          setLastTimeRecord(null);
        }
      } catch (error) {
        console.warn('Clock status check unavailable:', error.message || 'Network error');
        setIsClockedIn(false);
        setLastTimeRecord(null);
      }
    };

    if (user) {
      checkClockStatus();
    }
  }, [user]);

  // F4 keyboard shortcut for Search WIP
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'F4') {
        event.preventDefault();
        setShowOpenROModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handlePayrollClick = (e) => {
    // If Paypro_user is true, allow default navigation to /Payroll
    if (user?.Paypro_user === true) {
      return;
    }

    // If false or null/undefined, redirect to WorkPro
    e.preventDefault();
    window.location.href = createPageUrl("WorkPro");
  };

  const handleClockToggle = async () => {
    if (!user || !isEmployee) return;
    const empName = workProName || user.full_name;
    if (!empName) return;

    try {
      const now = new Date();

      if (isClockedIn && lastTimeRecord) {
        // Clock out - update existing record
        const clockOutTime = now.toISOString();
        const clockInTime = new Date(lastTimeRecord.clock_in_time);
        const totalHours = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

        const updateResponse = await base44.functions.invoke('workProProxy', {
          entityName: 'TimeRecord',
          method: 'update',
          id: lastTimeRecord.id,
          params: {
            clock_out_time: clockOutTime,
            total_hours: Math.round(totalHours * 100) / 100,
            status: 'clocked_out'
          }
        });

        if (updateResponse.data.success) {
          setIsClockedIn(false);
          setLastTimeRecord(null);
          alert(`Clocked out at ${now.toLocaleTimeString()}. Total hours: ${Math.round(totalHours * 100) / 100}`);
        } else {
            console.error(`Error clocking out: ${updateResponse.data?.error || 'Unknown error'}`);
            alert('Error clocking out. Please try again.');
        }
      } else {
        // Clock in - create new record
        const clockInTime = now.toISOString();

        const createResponse = await base44.functions.invoke('workProProxy', {
          entityName: 'TimeRecord',
          method: 'create',
          params: {
            employee_name: empName,
            clock_in_time: clockInTime,
            status: 'clocked_in',
            total_hours: 0,
            pto_hours: 0,
            stat_hours: 0
          }
        });

        if (createResponse.data.success) {
          const newRecord = createResponse.data.data;
          setIsClockedIn(true);
          setLastTimeRecord(newRecord);
          alert(`Clocked in at ${now.toLocaleTimeString()}`);
        } else {
            console.error(`Error clocking in: ${createResponse.data?.error || 'Unknown error'}`);
            alert('Error clocking in. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error toggling clock:', error);
      alert('Error updating time record. Please try again.');
    }
  };

  const handleGlobalClockInSuccess = (newRecord) => {
    setIsClockedIn(true);
    setLastTimeRecord(newRecord);
    alert(`Clocked in successfully at ${new Date(newRecord.clock_in_time).toLocaleTimeString()}`);
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

  const handleMenuClick = (action) => {
    console.log('🎯 handleMenuClick called with action:', action);
    console.log('📍 Current location:', window.location.href);
    console.log('📍 Current pathname:', window.location.pathname);
    
    setHoveredItem(null);
    setIsMobileMenuOpen(false);
    setMobileDropdownOpen(null);
    
    switch (action) {
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
  user?.access_level === 'lvl3_user' ? {
    title: "Accounting",
    icon: CreditCard,
    defaultUrl: createPageUrl("CashDrawer"),
    activePaths: ["/CashDrawer", "/ChequeRegister", "/Taxes", "/JournalEntries", "/ChartOfAccounts", "/Bank", "/FiscalPeriods", "/Reconcile", "/ReconcileReport", "/ChequeWriter", "/PLReport", "/BalanceSheet", "/FinancialDashboard", "/GLAcct"],
    dropdown: [
      { title: "Cash Drawer", url: createPageUrl("CashDrawer"), icon: Wallet },
      { title: "Bank Accounts", url: createPageUrl("Bank"), icon: University },
      { title: "Cheque Register", url: createPageUrl("ChequeRegister"), icon: BookCheck },
      { title: "Taxes", url: createPageUrl("Taxes"), icon: Percent },
      { title: "Journal Entries", url: createPageUrl("JournalEntries"), icon: BookCopy },
      { title: "Fiscal Periods", url: createPageUrl("FiscalPeriods"), icon: CalendarClock },
      { title: "Reports", action: "showFinancialReports", icon: BarChart3 },
      { title: "Chart of Accounts", url: createPageUrl("ChartOfAccounts"), icon: Network },
    ]
  } : {
    title: "Accounting",
    icon: CreditCard,
    url: createPageUrl("CashDrawer"),
    activePaths: ["/CashDrawer"],
  },
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
      await UserEntity.logout();
      window.location.reload();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const getUserInitials = (user) => {
    if (user?.Initials) return user.Initials;
    if (!user || !user.full_name) return "?";
    const names = user.full_name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return names[0].substring(0, 2).toUpperCase();
  };

  const toggleMobileDropdown = (itemTitle) => {
    setMobileDropdownOpen(prev => prev === itemTitle ? null : itemTitle);
  };

  const handleMobileLinkClick = () => {
    setIsMobileMenuOpen(false);
    setMobileDropdownOpen(null);
  };
  
  if (currentPageName === 'WorkOrderEdit' || currentPageName === 'EstimateEdit' || currentPageName === 'WorkOrderView' || currentPageName === 'CreditInvoice' || currentPageName === 'InvoiceConversion' || currentPageName === 'GLAcct' || currentPageName === 'WorkPROView' || currentPageName === 'StockReorderReport' || currentPageName === 'GeneralLedger' || currentPageName === 'GLJournal' || currentPageName === 'FinancialDashboard' || currentPageName === 'InventoryValuation') {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-slate-400' : 'bg-slate-50'}`}>
        <main>{children}</main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-400' : 'bg-slate-50'}`}>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40">
        {isTraining && (
          <div className="bg-orange-500 text-white text-center py-1 text-sm font-bold shadow-inner">
            Training Version of AutoPRO. No changes in this application will affect the live database.
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
                                    <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b90236f4d7e6ac0de4a262/094d1d78c_KensLogoOnly.jpg" alt="Logo" className="h-10" />
                                  </div>

              {/* AutoPRO Area */}
              <div
                onClick={() => {
                  window.location.href = createPageUrl("Home");
                }}
                className="flex flex-col justify-center px-3 py-2 rounded-lg transition-all duration-300 cursor-pointer hover:bg-slate-100"
              >
                <div className="text-lg font-bold text-slate-800 leading-tight">
                  AutoPRO
                </div>
                <div className="text-xs text-gray-500 leading-tight">
                  Ken's Auto
                </div>
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Toggle mobile menu"
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6 text-slate-700" />
                ) : (
                  <Menu className="w-6 h-6 text-slate-700" />
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
                              window.location.href = item.defaultUrl;
                            }}
                            className={`flex flex-col items-center gap-1 px-3 py-2 transition-colors duration-200 cursor-pointer rounded-md ${
                              isActive
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-600 hover:text-blue-700'
                            }`}
                          >
                            <item.icon className="w-5 h-5" />
                            <span className="text-sm font-medium">{item.title}</span>
                          </div>
                        );
                      })()}
                      
                      {hoveredItem === item.title && (
                        <div 
                          className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50"
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
                                    window.location.href = subItem.url;
                                  }}
                                  className="flex items-center gap-3 px-4 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors cursor-pointer"
                                >
                                  <subItem.icon className="w-4 h-4" />
                                  {subItem.title}
                                </div>
                              ) : (
                                <div
                                  onClick={() => handleMenuClick(subItem.action)}
                                  className="flex items-center gap-3 px-4 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors cursor-pointer"
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
                                window.location.href = item.url;
                              }
                            } else {
                              window.location.href = item.url;
                            }
                          }}
                          className={`flex flex-col items-center gap-1 px-3 py-2 transition-colors duration-200 cursor-pointer rounded-md ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 hover:text-blue-700'
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
                disabled={!isEmployee}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ${
                  !isEmployee
                    ? 'bg-blue-600 text-white opacity-90 cursor-not-allowed'
                    : isClockedIn 
                      ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                      : 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
                }`}
              >
                <Clock className="w-5 h-5" />
                <div className="flex flex-col items-start">
                  <span className={`text-xs ${isClockedIn || !isEmployee ? 'font-medium' : 'font-bold'}`}>
                    {!isEmployee ? 'Unavailable' : (isClockedIn ? 'Clock Out' : 'Clock In')}
                  </span>
                  {isEmployee && (
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
                      <AvatarImage src={user?.avatar_url} />
                      <AvatarFallback className="bg-slate-200 text-slate-700 font-bold">
                        {getUserInitials(user)}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span>{user?.User_name || user?.full_name || 'My Account'}</span>
                    <span className="text-xs font-normal text-slate-500">
                      {user?.role === 'admin' ? "Program Administrator" :
                       user?.access_level === 'lvl3_user' ? "Executive Access" :
                       user?.access_level === 'lvl2_user' ? "Supervisor Access" :
                       "Standard Access"}
                    </span>
                  </DropdownMenuLabel>
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
                      {user?.role === 'admin' && (
                        <>
                          <DropdownMenuItem onClick={() => window.location.href = createPageUrl('Admin')} className="cursor-pointer">
                            <Shield className="mr-2 h-4 w-4" />
                            <span>Admin Dashboard</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleToggleOpenNewWindow} className="cursor-pointer">
                            <span className="mr-2">{user?.OpenNewWindow ? '☑' : '☐'}</span>
                            <span>Open New Windows</span>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
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
        <div className="lg:hidden fixed top-16 left-0 w-full bg-white shadow-lg z-30 overflow-y-auto h-[calc(100vh-4rem)] border-t border-slate-200">
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
                          className={`w-full flex items-center justify-between px-6 py-4 transition-colors ${
                            isActive
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
                                  window.location.href = subItem.url;
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
                              window.location.href = item.url;
                            }
                          } else {
                            handleMobileLinkClick();
                            window.location.href = item.url;
                          }
                        }}
                        className={`flex items-center gap-3 px-6 py-4 transition-colors cursor-pointer ${
                          isActive
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
        currentUser={user}
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
      />

      <OpenROModal
        open={showOpenROModal}
        onClose={() => setShowOpenROModal(false)}
      />

      <TechClockStatusModal
        open={showTechClockStatusModal}
        onClose={closeTechClockStatusModal}
      />

      <GlobalClockInModal
        open={showGlobalClockInModal}
        onClose={() => setShowGlobalClockInModal(false)}
        user={user}
        onClockIn={handleGlobalClockInSuccess}
      />
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <TechClockStatusProvider>
      <LayoutContent children={children} currentPageName={currentPageName} />
    </TechClockStatusProvider>
  );
}