import React, { createContext, useContext, useState } from 'react';

const TechClockStatusContext = createContext();

export function TechClockStatusProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialProjectId, setInitialProjectId] = useState(null);

  const openTechClockStatusModal = (projectId = null) => {
    setInitialProjectId(projectId);
    setIsOpen(true);
  };
  const closeTechClockStatusModal = () => {
    setIsOpen(false);
    setInitialProjectId(null);
  };

  return (
    <TechClockStatusContext.Provider value={{ isOpen, openTechClockStatusModal, closeTechClockStatusModal }}>
      {children}
    </TechClockStatusContext.Provider>
  );
}

export function useTechClockStatus() {
  const context = useContext(TechClockStatusContext);
  if (!context) {
    throw new Error('useTechClockStatus must be used within a TechClockStatusProvider');
  }
  return context;
}