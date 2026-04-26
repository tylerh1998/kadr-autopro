import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const SupplierLockContext = createContext(null);

export function SupplierLockProvider({ children }) {
  const [lockState, setLockState] = useState({
    supplierId: null,
    supplierName: '',
    hasUnsavedChanges: false,
    releaseLock: null,
    saveBeforeLeave: null,
    isActive: false,
  });

  const registerSupplierLock = useCallback((data) => {
    setLockState(prev => ({ ...prev, ...data, isActive: true }));
  }, []);

  const updateSupplierLock = useCallback((data) => {
    setLockState(prev => ({ ...prev, ...data }));
  }, []);

  const clearSupplierLock = useCallback(() => {
    setLockState({
      supplierId: null,
      supplierName: '',
      hasUnsavedChanges: false,
      releaseLock: null,
      saveBeforeLeave: null,
      isActive: false,
    });
  }, []);

  const value = useMemo(() => ({
    lockState,
    registerSupplierLock,
    updateSupplierLock,
    clearSupplierLock,
  }), [lockState, registerSupplierLock, updateSupplierLock, clearSupplierLock]);

  return <SupplierLockContext.Provider value={value}>{children}</SupplierLockContext.Provider>;
}

export function useSupplierLock() {
  const context = useContext(SupplierLockContext);
  if (!context) {
    throw new Error('useSupplierLock must be used within a SupplierLockProvider');
  }
  return context;
}