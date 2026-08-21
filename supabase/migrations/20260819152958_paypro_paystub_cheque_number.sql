-- Adds the manual-cheque backup path to Mark Paid: a cheque number, distinct from
-- paycheque_number (a YYYYMM-XXX label assigned at stub-creation time, unrelated to any
-- bank account). This one is only ever populated when a single stub is paid via the
-- "Print Cheque" checkbox in BatchPaymentModal, sourced from BankAccount.next_cheque_number
-- (same convention as SupplierPayment.cheque_number).
ALTER TABLE "PayPro_PayStub" ADD COLUMN IF NOT EXISTS cheque_number text;
