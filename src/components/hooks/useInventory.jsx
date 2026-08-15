import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

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
      const [inventoryResult, employeeResult] = await Promise.all([
        supabase.from('InventoryItem').select('*'),
        supabase.from('Employee').select('*'),
      ]);
      if (inventoryResult.error) throw inventoryResult.error;
      if (employeeResult.error) throw employeeResult.error;

      const inventoryData = inventoryResult.data || [];
      const employeeData = employeeResult.data || [];
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