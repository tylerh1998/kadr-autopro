/**
 * Utility functions for handling Mountain Time (MT) conversions
 * Mountain Time is UTC-7 (MST) or UTC-6 (MDT)
 */

/**
 * Get current date/time in Mountain Time
 * @returns {Date} Current date in Mountain Time
 */
export function getMountainTimeNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Denver' }));
}

/**
 * Convert UTC date to Mountain Time
 * @param {Date|string} utcDate - UTC date to convert
 * @returns {Date} Date in Mountain Time
 */
export function toMountainTime(utcDate) {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  return new Date(date.toLocaleString('en-US', { timeZone: 'America/Denver' }));
}

/**
 * Check if a lock timestamp is expired (older than 24 hours in Mountain Time)
 * @param {string|Date} lockTimestamp - The lock timestamp to check
 * @returns {boolean} True if expired or invalid, false otherwise
 */
export function isLockExpired(lockTimestamp) {
  if (!lockTimestamp) return true;
  
  try {
    const lockTime = toMountainTime(lockTimestamp);
    const now = getMountainTimeNow();
    const hoursDiff = (now - lockTime) / (1000 * 60 * 60);
    
    return hoursDiff >= 24;
  } catch (error) {
    console.error('Error checking lock expiry:', error);
    return true; // Treat invalid timestamps as expired
  }
}

/**
 * Check if a bank account is locked by another user
 * @param {Object} account - Bank account object
 * @param {string} currentUserEmail - Current user's email
 * @returns {Object} { isLocked: boolean, lockedByUser: string|null, isExpired: boolean }
 */
export function checkBankAccountLock(account, currentUserEmail) {
  if (!account) {
    return { isLocked: false, lockedByUser: null, isExpired: false };
  }

  const { locked_by_user, locked_timestamp } = account;
  
  // No lock exists
  if (!locked_by_user) {
    return { isLocked: false, lockedByUser: null, isExpired: false };
  }
  
  // Check if lock is expired
  const isExpired = isLockExpired(locked_timestamp);
  
  // Locked by current user or expired
  if (locked_by_user === currentUserEmail || isExpired) {
    return { isLocked: false, lockedByUser: locked_by_user, isExpired };
  }
  
  // Locked by another user
  return { isLocked: true, lockedByUser: locked_by_user, isExpired: false };
}

/**
 * Check if an entity (Supplier, BankAccount, etc.) is locked by another user
 * @param {Object} entity - Entity object with lock fields
 * @param {string} currentUserEmail - Current user's email
 * @returns {Object} { isLocked: boolean, lockedByUser: string|null, isExpired: boolean }
 */
export function checkEntityLock(entity, currentUserEmail) {
  if (!entity) {
    return { isLocked: false, lockedByUser: null, isExpired: false };
  }

  // Support both naming conventions: locked_by_user and LockedByUser
  const locked_by_user = entity.locked_by_user || entity.LockedByUser;
  const locked_timestamp = entity.locked_timestamp;
  
  // No lock exists
  if (!locked_by_user) {
    return { isLocked: false, lockedByUser: null, isExpired: false };
  }
  
  // Check if lock is expired
  const isExpired = isLockExpired(locked_timestamp);
  
  // Locked by current user or expired
  if (locked_by_user === currentUserEmail || isExpired) {
    return { isLocked: false, lockedByUser: locked_by_user, isExpired };
  }
  
  // Locked by another user
  return { isLocked: true, lockedByUser: locked_by_user, isExpired: false };
}