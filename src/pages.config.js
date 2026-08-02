/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import APSummary from './pages/APSummary';
import Admin from './pages/Admin';
import BalanceSheet from './pages/BalanceSheet';
import Bank from './pages/Bank';
import CashDrawer from './pages/CashDrawer';
import CashFlow from './pages/CashFlow';
import ChartOfAccounts from './pages/ChartOfAccounts';
import ChequeRegister from './pages/ChequeRegister';
import ChequeWriter from './pages/ChequeWriter';
import CreditInvoice from './pages/CreditInvoice';
import CustomerARSummary from './pages/CustomerARSummary';
import CustomerARTransactions from './pages/CustomerARTransactions';
import Customers from './pages/Customers';
import EmailLog from './pages/EmailLog';
import EstimateEdit from './pages/EstimateEdit';
import FinancialDashboard from './pages/FinancialDashboard';
import FiscalPeriods from './pages/FiscalPeriods';
import GLAcct from './pages/GLAcct';
import GLJournal from './pages/GLJournal';
import GeneralLedger from './pages/GeneralLedger';
import Home from './pages/Home';
import InventoryAdd from './pages/InventoryAdd';
import InventoryList from './pages/InventoryList';
import InventoryReturns from './pages/InventoryReturns';
import InventoryValuation from './pages/InventoryValuation';
import InvoiceConversion from './pages/InvoiceConversion';
import JournalEntries from './pages/JournalEntries';
import LankarImport from './pages/LankarImport';
import LinesOfCredit from './pages/LinesOfCredit';
import PLReport from './pages/PLReport';
import Payroll from './pages/Payroll';
import Reconcile from './pages/Reconcile';
import ReconcileReport from './pages/ReconcileReport';
import Schedule from './pages/Schedule';
import Setup from './pages/Setup';
import StockReorderReport from './pages/StockReorderReport';
import SupplierTx from './pages/SupplierTx';
import SupplierTxView from './pages/SupplierTxView';
import Suppliers from './pages/Suppliers';
import Taxes from './pages/Taxes';
import Vehicles from './pages/Vehicles';
import WorkOrderEdit from './pages/WorkOrderEdit';
import WorkOrderView from './pages/WorkOrderView';
import WorkOrders from './pages/WorkOrders';
import WorkPROView from './pages/WorkPROView';
import __Layout from './Layout.jsx';


export const PAGES = {
    "APSummary": APSummary,
    "Admin": Admin,
    "BalanceSheet": BalanceSheet,
    "Bank": Bank,
    "CashDrawer": CashDrawer,
    "CashFlow": CashFlow,
    "ChartOfAccounts": ChartOfAccounts,
    "ChequeRegister": ChequeRegister,
    "ChequeWriter": ChequeWriter,
    "CreditInvoice": CreditInvoice,
    "CustomerARSummary": CustomerARSummary,
    "CustomerARTransactions": CustomerARTransactions,
    "Customers": Customers,
    "EmailLog": EmailLog,
    "EstimateEdit": EstimateEdit,
    "FinancialDashboard": FinancialDashboard,
    "FiscalPeriods": FiscalPeriods,
    "GLAcct": GLAcct,
    "GLJournal": GLJournal,
    "GeneralLedger": GeneralLedger,
    "Home": Home,
    "InventoryAdd": InventoryAdd,
    "InventoryList": InventoryList,
    "InventoryReturns": InventoryReturns,
    "InventoryValuation": InventoryValuation,
    "InvoiceConversion": InvoiceConversion,
    "JournalEntries": JournalEntries,
    "LankarImport": LankarImport,
    "LinesOfCredit": LinesOfCredit,
    "PLReport": PLReport,
    "Payroll": Payroll,
    "Reconcile": Reconcile,
    "ReconcileReport": ReconcileReport,
    "Schedule": Schedule,
    "Setup": Setup,
    "StockReorderReport": StockReorderReport,
    "SupplierTx": SupplierTx,
    "SupplierTxView": SupplierTxView,
    "Suppliers": Suppliers,
    "Taxes": Taxes,
    "Vehicles": Vehicles,
    "WorkOrderEdit": WorkOrderEdit,
    "WorkOrderView": WorkOrderView,
    "WorkOrders": WorkOrders,
    "WorkPROView": WorkPROView,
}

export const pagesConfig = {
    mainPage: "WorkOrders",
    Pages: PAGES,
    Layout: __Layout,
};