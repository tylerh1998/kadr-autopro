import { useState, useEffect, useCallback } from 'react';
import { InventoryItem, Employee } from '@/entities/all';

export function useShopData() {
  const [inventory, setInventory] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchShopData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [inventoryData, employeeData] = await Promise.all([
        InventoryItem.list(),
        Employee.list(),
      ]);
      setInventory(inventoryData);
      setEmployees(employeeData.filter(e => e.position === 'technician' || e.position === 'apprentice'));
    } catch (e) {
      console.error('Error fetching shop data:', e);
      setError('Failed to load inventory or employee data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShopData();
  }, [fetchShopData]);

  return { inventory, employees, loading, error, refetchInventory: fetchShopData };
}