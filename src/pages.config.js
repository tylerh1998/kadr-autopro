import WorkOrders from './pages/WorkOrders';
import CashDrawer from './pages/CashDrawer';
import Vehicles from './pages/Vehicles';
import WorkOrderEdit from './pages/WorkOrderEdit';
import Customers from './pages/Customers';
import Setup from './pages/Setup';
import InventoryList from './pages/InventoryList';
import CustomerHistory from './pages/CustomerHistory';
import CustomerARTransactions from './pages/CustomerARTransactions';
import CustomerARSummary from './pages/CustomerARSummary';
import VehicleHistory from './pages/VehicleHistory';
import Suppliers from './pages/Suppliers';
import APSummary from './pages/APSummary';
import LinesOfCredit from './pages/LinesOfCredit';
import ChequeRegister from './pages/ChequeRegister';
import Taxes from './pages/Taxes';
import JournalEntries from './pages/JournalEntries';
import ChartOfAccounts from './pages/ChartOfAccounts';
import InventoryReturns from './pages/InventoryReturns';
import Schedule from './pages/Schedule';
import SupplierTx from './pages/SupplierTx';
import GLAcct from './pages/GLAcct';
import Bank from './pages/Bank';
import InventoryAdd from './pages/InventoryAdd';
import WorkOrderView from './pages/WorkOrderView';
import FiscalPeriods from './pages/FiscalPeriods';
import EmailLog from './pages/EmailLog';
import InvoiceConversion from './pages/InvoiceConversion';
import SupplierTxView from './pages/SupplierTxView';
import Payroll from './pages/Payroll';
import CreditInvoice from './pages/CreditInvoice';
import Reconcile from './pages/Reconcile';
import ReconcileReport from './pages/ReconcileReport';
import ChequeWriter from './pages/ChequeWriter';
import PLReport from './pages/PLReport';
import BalanceSheet from './pages/BalanceSheet';
import FinancialDashboard from './pages/FinancialDashboard';
import WorkPro from './pages/WorkPro';
import WorkPROView from './pages/WorkPROView';
import StockReorderReport from './pages/StockReorderReport';
import GeneralLedger from './pages/GeneralLedger';
import GLJournal from './pages/GLJournal';
import InventoryValuation from './pages/InventoryValuation';
import BatchUploader from './pages/BatchUploader';
import __Layout from './Layout.jsx';


export const PAGES = {
    "WorkOrders": WorkOrders,
    "CashDrawer": CashDrawer,
    "Vehicles": Vehicles,
    "WorkOrderEdit": WorkOrderEdit,
    "Customers": Customers,
    "Setup": Setup,
    "InventoryList": InventoryList,
    "CustomerHistory": CustomerHistory,
    "CustomerARTransactions": CustomerARTransactions,
    "CustomerARSummary": CustomerARSummary,
    "VehicleHistory": VehicleHistory,
    "Suppliers": Suppliers,
    "APSummary": APSummary,
    "LinesOfCredit": LinesOfCredit,
    "ChequeRegister": ChequeRegister,
    "Taxes": Taxes,
    "JournalEntries": JournalEntries,
    "ChartOfAccounts": ChartOfAccounts,
    "InventoryReturns": InventoryReturns,
    "Schedule": Schedule,
    "SupplierTx": SupplierTx,
    "GLAcct": GLAcct,
    "Bank": Bank,
    "InventoryAdd": InventoryAdd,
    "WorkOrderView": WorkOrderView,
    "FiscalPeriods": FiscalPeriods,
    "EmailLog": EmailLog,
    "InvoiceConversion": InvoiceConversion,
    "SupplierTxView": SupplierTxView,
    "Payroll": Payroll,
    "CreditInvoice": CreditInvoice,
    "Reconcile": Reconcile,
    "ReconcileReport": ReconcileReport,
    "ChequeWriter": ChequeWriter,
    "PLReport": PLReport,
    "BalanceSheet": BalanceSheet,
    "FinancialDashboard": FinancialDashboard,
    "WorkPro": WorkPro,
    "WorkPROView": WorkPROView,
    "StockReorderReport": StockReorderReport,
    "GeneralLedger": GeneralLedger,
    "GLJournal": GLJournal,
    "InventoryValuation": InventoryValuation,
    "BatchUploader": BatchUploader,
}

export const pagesConfig = {
    mainPage: "WorkOrders",
    Pages: PAGES,
    Layout: __Layout,
};