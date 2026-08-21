import { PayStub } from "@/components/paypro/lib/payrollEntities";

/**
 * Generates the next paycheque number based on pay period end date
 * Format: YYYYMM-XXX (e.g., 202509-001, 202509-002)
 */
export const generatePaychequeNumber = async (payPeriodEnd) => {
  try {
    // Extract year and month from pay period end date
    const endDate = new Date(payPeriodEnd);
    const year = endDate.getFullYear();
    const month = String(endDate.getMonth() + 1).padStart(2, '0');
    const prefix = `${year}${month}`;

    // Get all existing pay stubs with paycheque numbers that start with this prefix
    const existingStubs = await PayStub.list();
    const matchingNumbers = existingStubs
      .filter(stub => stub.paycheque_number && stub.paycheque_number.startsWith(prefix))
      .map(stub => {
        const parts = stub.paycheque_number.split('-');
        return parts.length === 2 ? parseInt(parts[1]) : 0;
      })
      .filter(num => !isNaN(num));

    // Find the next sequential number
    const nextNumber = matchingNumbers.length > 0
      ? Math.max(...matchingNumbers) + 1
      : 1;

    // Format as XXX with leading zeros
    const formattedNumber = String(nextNumber).padStart(3, '0');

    return `${prefix}-${formattedNumber}`;
  } catch (error) {
    console.error("Error generating paycheque number:", error);
    // Fallback to timestamp-based number if there's an error
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = String(now.getTime()).slice(-3);
    return `${year}${month}-${timestamp}`;
  }
};
