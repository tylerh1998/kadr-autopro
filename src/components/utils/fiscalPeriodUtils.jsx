import { FiscalPeriod } from '@/entities/all';

/**
 * Checks if a given date falls within an active, open fiscal period.
 * @param {string} dateString - Date in YYYY-MM-DD format (or ISO format with time)
 * @returns {Promise<{isValid: boolean, message: string}>} Status object indicating if the date is in an open fiscal period
 */
export async function checkFiscalPeriodStatus(dateString) {
  try {
    // Validate input
    if (!dateString) {
      return {
        isValid: false,
        message: "No date provided for fiscal period check."
      };
    }

    // Fetch all fiscal periods
    const fiscalPeriods = await FiscalPeriod.list();
    
    if (!fiscalPeriods || fiscalPeriods.length === 0) {
      return {
        isValid: false,
        message: "No fiscal periods have been configured. Please set up fiscal periods in the system."
      };
    }
    
    // Extract just the date part (YYYY-MM-DD) from the input, handling various formats
    let datePart;
    if (typeof dateString === 'string') {
      // If it's an ISO datetime string (e.g., "2024-01-15T10:30:00.000Z"), extract the date part
      // If it's already just a date (e.g., "2024-01-15"), use it as is
      datePart = dateString.split('T')[0];
    } else {
      return {
        isValid: false,
        message: "Invalid date format provided."
      };
    }
    
    // Validate the date part is in YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(datePart)) {
      return {
        isValid: false,
        message: "Invalid date format provided."
      };
    }
    
    // Parse the input date as UTC start-of-day to avoid timezone issues
    const checkDate = new Date(datePart + 'T00:00:00Z');
    
    // Validate that we got a valid date
    if (isNaN(checkDate.getTime())) {
      return {
        isValid: false,
        message: "Invalid date format provided."
      };
    }
    
    // Find a matching fiscal period
    for (const period of fiscalPeriods) {
      const startDate = new Date(period.start_date + 'T00:00:00Z');
      const endDate = new Date(period.end_date + 'T00:00:00Z');
      
      // Check if the date falls within this period (inclusive of both start and end dates)
      if (checkDate >= startDate && checkDate <= endDate) {
        // Found a matching period, check if it's closed
        if (period.is_closed) {
          return {
            isValid: false,
            message: "Date is in a closed fiscal period. No changes can be made."
          };
        } else {
          return {
            isValid: true,
            message: "Date is in an open fiscal period."
          };
        }
      }
    }
    
    // No matching period found
    return {
      isValid: false,
      message: "No valid fiscal period found for this date. No changes can be made."
    };
    
  } catch (error) {
    console.error('Error checking fiscal period status:', error);
    return {
      isValid: false,
      message: "Error checking fiscal period. Please try again."
    };
  }
}