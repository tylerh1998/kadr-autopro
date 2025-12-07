import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { WorkOrder } from '@/entities/all';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

export default function FindPartModal({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('part_number');
  const [searchFilter, setSearchFilter] = useState('contains');
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchTerm) {
      setResults([]);
      return;
    }
    setLoading(true);
    setResults([]);

    try {
      const allWorkOrders = await WorkOrder.list();
      const foundItems = [];
      const uniquePartCheck = new Set();

      for (const wo of allWorkOrders) {
        if (!wo.line_items || typeof wo.line_items !== 'string') continue;
        
        try {
          const lineItems = JSON.parse(wo.line_items);
          if (!Array.isArray(lineItems)) continue;

          for (const item of lineItems) {
            if (!item.part_number) continue;

            const partNumber = item.part_number.toLowerCase();
            const term = searchTerm.toLowerCase();
            let isMatch = false;

            if (searchFilter === 'contains') {
              isMatch = partNumber.includes(term);
            } else if (searchFilter === 'startsWith') {
              isMatch = partNumber.startsWith(term);
            } else if (searchFilter === 'endsWith') {
              isMatch = partNumber.endsWith(term);
            }

            if (isMatch) {
              const uniqueKey = `${item.part_number}-${item.description}`;
              if (!uniquePartCheck.has(uniqueKey)) {
                foundItems.push({
                  part_number: item.part_number,
                  description: item.description,
                  ro_number: wo.ro_number,
                  work_order_id: wo.id,
                });
                uniquePartCheck.add(uniqueKey);
              }
            }
          }
        } catch (e) {
          console.warn(`Could not parse line_items for WO ${wo.id}:`, e);
        }
      }
      setResults(foundItems);
    } catch (error) {
      console.error('Error searching for parts:', error);
      alert('An error occurred while searching. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, searchFilter]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl min-h-[60vh]">
        <DialogHeader>
          <DialogTitle>Find Part</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="part_number">Part #</TabsTrigger>
            <TabsTrigger value="serial_number">Serial #</TabsTrigger>
          </TabsList>
          <TabsContent value="part_number" className="mt-4 space-y-4">
            <div className="flex items-center gap-6">
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
              <div className="relative flex-grow">
                <Input
                  placeholder="Enter Part #"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} disabled={loading}>{loading ? 'Searching...' : 'Search'}</Button>
            </div>
            <div className="border rounded-md h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Last Seen on RO #</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={3} className="text-center">Searching...</TableCell></TableRow>
                  ) : results.length > 0 ? (
                    results.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.part_number}</TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>
                          <Link
                            to={createPageUrl(`WorkOrderEdit?id=${item.work_order_id}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                           >
                            {item.ro_number}
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={3} className="text-center">No results found.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="serial_number" className="mt-4">
            <p>Serial # module not created yet.</p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}