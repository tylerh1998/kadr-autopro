import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, CalendarClock } from 'lucide-react';
import FiscalPeriodForm from '../components/fiscal-periods/FiscalPeriodForm';

export default function FiscalPeriodsPage() {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState(null);

  useEffect(() => {
    loadPeriods();
  }, []);

  const loadPeriods = async () => {
    setLoading(true);
    try {
      const { data: periodsData, error } = await supabase
        .from('FiscalPeriod')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      setPeriods(periodsData || []);
    } catch (error) {
      console.error('Error loading fiscal periods:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (period) => {
    try {
      await supabase.from('FiscalPeriod').update({ is_closed: !period.is_closed, updated_date: new Date().toISOString() }).eq('id', period.id);
      loadPeriods();
    } catch (error) {
      console.error('Error updating period status:', error);
      alert('Failed to update period status.');
    }
  };

  const handleSubmit = async (periodData) => {
    try {
      const now = new Date().toISOString();
      if (editingPeriod) {
        await supabase.from('FiscalPeriod').update({ ...periodData, updated_date: now }).eq('id', editingPeriod.id);
      } else {
        const id = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        await supabase.from('FiscalPeriod').insert([{ id, ...periodData, created_date: now, updated_date: now }]);
      }
      setShowForm(false);
      setEditingPeriod(null);
      loadPeriods();
    } catch (error) {
      console.error('Error saving fiscal period:', error);
      alert('Failed to save fiscal period.');
    }
  };

  const handleEdit = (period) => {
    setEditingPeriod(period);
    setShowForm(true);
  };

  // Helper function to format dates consistently
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return '';
    // Handle the date string to avoid timezone issues
    const date = new Date(dateString + 'T00:00:00'); // Force local time, assuming dateString is YYYY-MM-DD
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Fiscal Periods</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Manage your company's fiscal periods to control transactions.</p>
          </div>
          {!showForm && (
            <Button 
              onClick={() => {
                setEditingPeriod(null);
                setShowForm(true);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Period
            </Button>
          )}
        </div>

        {showForm ? (
          <FiscalPeriodForm
            period={editingPeriod}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setEditingPeriod(null);
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5" />
                All Fiscal Periods
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[35%]">Start Date</TableHead>
                      <TableHead className="w-[35%]">End Date</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center w-[20%]">Period Closed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array(5).fill(0).map((_, i) => (
                        <TableRow key={i} className="animate-pulse">
                          <TableCell><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32"></div></TableCell>
                          <TableCell><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32"></div></TableCell>
                          <TableCell className="text-center"><div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto"></div></TableCell>
                          <TableCell className="text-center"><div className="h-6 w-12 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto"></div></TableCell>
                        </TableRow>
                      ))
                    ) : periods.length > 0 ? (
                      periods.map((period) => (
                        <TableRow key={period.id} onDoubleClick={() => handleEdit(period)} className="cursor-pointer">
                          <TableCell className="font-medium">{formatDateForDisplay(period.start_date)}</TableCell>
                          <TableCell className="font-medium">{formatDateForDisplay(period.end_date)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={period.is_closed ? "destructive" : "default"}>
                              {period.is_closed ? 'Closed' : 'Open'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center">
                              <Switch
                                checked={period.is_closed}
                                onCheckedChange={() => handleToggleStatus(period)}
                                aria-label={`Toggle status for period ending ${period.end_date}`}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan="4" className="p-12 text-center text-slate-500 dark:text-slate-400">
                          <p>No fiscal periods have been created yet.</p>
                          <p className="text-sm mt-2">Click "Create New Period" to get started.</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}