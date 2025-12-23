import APSummary from './pages/APSummary';
import BalanceSheet from './pages/BalanceSheet';
import Bank from './pages/Bank';
import CashDrawer from './pages/CashDrawer';
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
import WorkPro from './pages/WorkPro';
import Admin from './pages/Admin';
import __Layout from './Layout.jsx';


export const PAGES = {
    "APSummary": APSummary,
    "BalanceSheet": BalanceSheet,
    "Bank": Bank,
    "CashDrawer": CashDrawer,
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
    "WorkPro": WorkPro,
    "Admin": Admin,
}

export const pagesConfig = {
    mainPage: "WorkOrders",
    Pages: PAGES,
    Layout: __Layout,
};