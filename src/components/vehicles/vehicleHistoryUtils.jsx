export const getVehicleHistoryStats = (workOrders = []) => {
  return workOrders.reduce(
    (totals, workOrder) => {
      const stage = workOrder.stage;
      const amount = parseFloat(workOrder.total_amount) || 0;

      if (stage === 'void') {
        totals.voidCount += 1;
        return totals;
      }

      totals.activeRoCount += 1;

      if (stage === 'work_order' || stage === 'invoice' || stage === 'credit_invoice') {
        totals.totalWork += amount;
      }

      return totals;
    },
    { activeRoCount: 0, voidCount: 0, totalWork: 0 }
  );
};

export const printVehicleHistory = () => {
  window.print();
};