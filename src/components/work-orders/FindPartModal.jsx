import React, { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';

export default function FindPartModal({ open, onClose, currentUser }) {
  const [activeTab, setActiveTab] = useState('part_number');
  const [searchFilter, setSearchFilter] = useState('contains');
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Clear results when tab changes or modal opens
  useEffect(() => {
    if (open) {
      setResults([]);
      setSearchTerm('');
    }
  }, [open, activeTab]);

  const handleSearch = useCallback(async () => {
    if (!searchTerm) {
      setResults([]);
      return;
    }
    setLoading(true);
    setResults([]);

    try {
      const { data: records, error } = await supabase.rpc('search_work_order_parts', {
        p_search_term: searchTerm,
        p_search_type: activeTab,
        p_filter_type: searchFilter
      });

      if (error) {
        console.error('Search error:', error);
        alert('Search failed: ' + error.message);
      } else {
        setResults(records || []);
      }
    } catch (error) {
      console.error('Error searching:', error);
      alert('An error occurred while searching. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, searchFilter, activeTab]);

  const renderSearchInterface = () => (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col md:flex-row items-center gap-6">
        <RadioGroup value={searchFilter} onValueChange={setSearchFilter} className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="startsWith" id="startsWith" />
            <Label htmlFor="startsWith">Starts with</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="contains" id="contains" />
            <Label htmlFor="contains">Contains</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="endsWith" id="endsWith" />
            <Label htmlFor="endsWith">Ends with</Label>
          </div>
        </RadioGroup>
        <div className="relative flex-grow w-full md:w-auto">
          <Input
            placeholder={activeTab === 'part_number' ? "Enter Part #" : "Enter Serial #"}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <Button onClick={handleSearch} disabled={loading} className="w-full md:w-auto">
          {loading ? (
             <>
               <Loader2 className="mr-2 h-4 w-4 animate-spin" />
               Searching...
             </>
          ) : 'Search'}
        </Button>
      </div>
      <div className="border rounded-md h-[500px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>RO #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Part #</TableHead>
              <TableHead>Description</TableHead>
              {activeTab === 'serial_number' && <TableHead>Serial #</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={activeTab === 'serial_number' ? 6 : 5} className="text-center h-24">Searching...</TableCell></TableRow>
            ) : results.length > 0 ? (
              results.map((item, index) => (
                <TableRow key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TableCell>
                    <button
                      onClick={() => {
                        const url = createPageUrl(`WorkOrderEdit?id=${item.ro_number}`);
                        // Check user's OpenNewWindow preference
                        if (currentUser?.OpenNewWindow === false) {
                          // Open in same tab
                          window.location.href = url;
                        } else {
                          // Open in new window (default behavior)
                          const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
                          window.open(url, '_blank', windowFeatures);
                        }
                      }}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-bold bg-transparent border-0 p-0 cursor-pointer"
                    >
                      {item.ro_number}
                    </button>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      if (!item.wo_date) return '-';
                      try {
                        // Try parsing as ISO first
                        return format(parseISO(item.wo_date), 'MM/dd/yyyy');
                      } catch (e) {
                        try {
                          // Fallback to standard Date parsing
                          const d = new Date(item.wo_date);
                          if (!isNaN(d.getTime())) {
                            return format(d, 'MM/dd/yyyy');
                          }
                          return item.wo_date; // Return raw string if parsing fails
                        } catch (e2) {
                          return item.wo_date;
                        }
                      }
                    })()}
                  </TableCell>
                  <TableCell>{item.customer_name || 'Unknown'}</TableCell>
                  <TableCell className="font-mono text-sm">{item.part_number}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  {activeTab === 'serial_number' && (
                    <TableCell className="font-mono text-sm bg-yellow-50 dark:bg-yellow-950/40">{item.serial_num}</TableCell>
                  )}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={activeTab === 'serial_number' ? 6 : 5} className="text-center h-24 text-slate-500 dark:text-slate-400">
                 {searchTerm ? 'No results found.' : 'Enter a search term to begin.'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[70vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Find Part in Work Orders</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="part_number">Search by Part #</TabsTrigger>
            <TabsTrigger value="serial_number">Search by Serial #</TabsTrigger>
          </TabsList>
          
          <TabsContent value="part_number">
            {renderSearchInterface()}
          </TabsContent>
          
          <TabsContent value="serial_number">
            {renderSearchInterface()}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}