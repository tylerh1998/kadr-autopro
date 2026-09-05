import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function NewSmsDialog({ isOpen, onClose, onStartChat }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setSearchResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('Customer')
          .select('id, first_name, last_name, org_name, phone, secondary_phone')
          .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,org_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
          .limit(10);
        
        if (!error && data) {
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleManualEntry = () => {
    const digitsOnly = searchTerm.replace(/\D/g, '');
    if (digitsOnly.length >= 10) {
      const phone = digitsOnly.slice(-10);
      onStartChat(phone);
      onClose();
    } else {
      alert('Please enter a valid 10-digit phone number');
    }
  };

  const handleSelectCustomer = (phone) => {
    if (!phone) return;
    const digitsOnly = phone.replace(/\D/g, '');
    const normalized = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
    if (normalized) {
      onStartChat(normalized);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by customer name or enter a 10-digit phone number..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="mt-4 max-h-[300px] overflow-y-auto space-y-2">
            {isSearching ? (
              <div className="text-sm text-slate-500 text-center py-2">Searching...</div>
            ) : searchResults.length > 0 ? (
              searchResults.map((cust) => {
                const name = cust.org_name || `${cust.first_name || ''} ${cust.last_name || ''}`.trim();
                return (
                  <div key={cust.id} className="border border-slate-100 dark:border-slate-800 rounded-md p-2">
                    <div className="font-medium text-sm flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      {name || 'Unknown Name'}
                    </div>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {cust.phone && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-xs"
                          onClick={() => handleSelectCustomer(cust.phone)}
                        >
                          Send to: {cust.phone}
                        </Button>
                      )}
                      {cust.secondary_phone && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-xs"
                          onClick={() => handleSelectCustomer(cust.secondary_phone)}
                        >
                          Send to: {cust.secondary_phone}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : searchTerm.length >= 2 ? (
              <div className="text-sm text-slate-500 text-center py-2">
                No customers found. You can send manually below.
              </div>
            ) : null}
          </div>
          
          {searchTerm.replace(/\D/g, '').length >= 10 && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button onClick={handleManualEntry} className="w-full">
                Send to {searchTerm.replace(/\D/g, '').slice(-10)}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

