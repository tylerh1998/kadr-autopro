import React from 'react';
import LineEditModal from './LineEditModal';
import EditInventoryTransactionModal from '../inventory/EditInventoryTransactionModal';
import SupplierPaymentModal from './SupplierPaymentModal';

export default function SupplierTxModals({
  showLineEditModal,
  setShowLineEditModal,
  showInventoryEditModal,
  setShowInventoryEditModal,
  editingLine,
  setEditingLine,
  handleLineUpdate,
  chartOfAccounts,
  supplierOptions,
  loadData,
  showPaymentModal,
  setShowPaymentModal,
  supplier,
  allConceptualInvoices,
  handlePaymentComplete,
}) {
  return (
    <>
      <LineEditModal
        open={showLineEditModal}
        onClose={() => {
          setShowLineEditModal(false);
          setEditingLine(null);
        }}
        line={editingLine}
        onSave={handleLineUpdate}
        chartOfAccounts={chartOfAccounts}
        suppliers={supplierOptions}
      />

      <EditInventoryTransactionModal
        isOpen={showInventoryEditModal}
        onClose={() => {
          setShowInventoryEditModal(false);
          setEditingLine(null);
        }}
        transaction={editingLine ? { ...editingLine, description: editingLine.description } : null}
        onUpdate={loadData}
      />

      <SupplierPaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        supplier={supplier}
        invoiceLines={allConceptualInvoices}
        onPaymentComplete={handlePaymentComplete}
      />
    </>
  );
}