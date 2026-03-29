import { useState, useEffect, useCallback } from 'react';
import { Employee } from '@/entities/all';
import { base44 } from '@/api/base44Client';

export function useShopData() {
  const [inventory, setInventory] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchShopData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [inventoryResponse, employeeData] = await Promise.all([
        base44.functions.invoke('SupabaseProxy', { action: 'read', table: 'InventoryItem' }),
        Employee.list(),
      ]);
      const inventoryData = inventoryResponse.data?.data || [];
      setInventory(inventoryData);
      setAllEmployees(employeeData); // Store all employees
      setEmployees(employeeData.filter(e => e.position === 'Technician'));
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

  return { inventory, employees, allEmployees, loading, error, refetchInventory: fetchShopData };
}