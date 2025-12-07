import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Save, Calendar, X } from 'lucide-react';

export default function FiscalPeriodForm({ period, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    start_date: '',
    end_date: ''
  });

  // Helper function to convert date string to YYYY-MM-DD format for input
  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    // Handle the date string to avoid timezone issues
    const date = new Date(dateString + 'T00:00:00'); // Force local time
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    if (period) {
      setFormData({
        start_date: formatDateForInput(period.start_date),
        end_date: formatDateForInput(period.end_date),
      });
    } else {
      setFormData({ start_date: '', end_date: '' });
    }
  }, [period]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.start_date || !formData.end_date) {
      alert('Please provide both a start and end date.');
      return;
    }

    // Validate that end date is after start date
    if (new Date(formData.end_date) <= new Date(formData.start_date)) {
      alert('End date must be after start date.');
      return;
    }

    onSubmit(formData);
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          {period ? 'Edit Fiscal Period' : 'Create New Fiscal Period'}
        </CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                value={formData.start_date}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                name="end_date"
                type="date"
                value={formData.end_date}
                onChange={handleChange}
                required
                min={formData.start_date} // Prevent selecting end date before start date
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
            <Save className="w-4 h-4 mr-2" />
            Save Period
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}