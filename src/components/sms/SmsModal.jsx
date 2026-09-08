import React, { useState, useEffect } from 'react';
import { X, Edit, MessageSquare, SquareArrowOutDownRight } from 'lucide-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import moment from 'moment-timezone';
import { supabase } from '@/lib/supabase';

import NewSmsDialog from './NewSmsDialog';
import SmsThread from './SmsThread';
import SmsCustomerModal from './SmsCustomerModal';

export default function SmsModal({ isOpen, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [selectedChatPhone, setSelectedChatPhone] = useState(null);
  const [isLoadingList, setIsLoadingList] = useState(false);

  // New Dialog State
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  const fetchConversations = async () => {
    setIsLoadingList(true);
    try {
      const { data, error } = await supabase.rpc('get_sms_conversations');
      if (error) throw error;
      setConversations(data || []);
    } catch (err) {
      console.error('Error fetching SMS conversations:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleOpenChat = (e) => {
      setSelectedChatPhone(e.detail.phone);
    };
    window.addEventListener('open-sms-chat', handleOpenChat);
    return () => window.removeEventListener('open-sms-chat', handleOpenChat);
  }, []);

  useEffect(() => {
    const handleRemoveUnread = (e) => {
      const { phone } = e.detail;
      setConversations(prev => prev.map(c => 
        c.external_phone === phone ? { ...c, is_unread: false } : c
      ));
    };
    window.addEventListener('remove-unread-sms', handleRemoveUnread);
    return () => window.removeEventListener('remove-unread-sms', handleRemoveUnread);
  }, []);

  useEffect(() => {
    const handleNewSms = (e) => {
      console.log('Live SMS broadcast received in SmsModal:', e.detail);
      fetchConversations();
    };

    window.addEventListener('new-sms-received', handleNewSms);
    return () => window.removeEventListener('new-sms-received', handleNewSms);
  }, []);

  if (!isOpen) return null;

  const selectedConversation = conversations.find(c => c.external_phone === selectedChatPhone);

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      
      <NewSmsDialog 
        isOpen={showNewDialog} 
        onClose={() => setShowNewDialog(false)}
        onStartChat={(phone) => setSelectedChatPhone(phone)}
      />

      <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 shrink-0 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold">Messages</h2>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowNewDialog(true)}>
            <Edit className="w-4 h-4" />
            New Message
          </Button>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          
          <Panel defaultSize={30} minSize={20} maxSize={45}>
            <div className="h-full bg-white dark:bg-slate-950 flex flex-col border-r border-slate-200 dark:border-slate-800">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                <input 
                  type="text" 
                  placeholder="Search messages..." 
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1 overflow-y-auto relative">
                {isLoadingList && conversations.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">Loading conversations...</div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">No messages yet.</div>
                ) : (
                  conversations.map((chat) => {
                    const isSelected = selectedChatPhone === chat.external_phone;
                    const previewText = chat.last_message || 'Attachment received';
                    return (
                      <div 
                        key={chat.external_phone}
                        onClick={() => setSelectedChatPhone(chat.external_phone)}
                        className={`group relative p-4 border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className={`text-sm truncate pr-2 ${isSelected ? 'text-white' : 'text-slate-900 dark:text-slate-100'} ${(chat.is_unread && !isSelected) ? 'font-extrabold' : 'font-semibold'}`}>
                            {chat.customer_name || chat.external_phone}
                          </span>
                          <span className={`text-xs whitespace-nowrap ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                            {moment(chat.last_activity).format('h:mm a')}
                          </span>
                        </div>
                        <p className={`text-sm line-clamp-1 pr-6 ${isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'} ${(chat.is_unread && !isSelected) ? 'font-bold text-slate-800 dark:text-slate-200' : ''}`}>
                          {previewText}
                        </p>
                        
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('open-sms-panel', { 
                              detail: { 
                                phone: chat.external_phone, 
                                customerName: chat.customer_name,
                                customerId: chat.customer_id
                              } 
                            }));
                            onClose(); 
                          }}
                          className={`absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-sm ${isSelected ? 'text-white hover:bg-blue-700' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800'}`}
                          title="Pop out to mini player"
                        >
                          <SquareArrowOutDownRight className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-slate-200 dark:bg-slate-800 hover:bg-blue-500 transition-colors cursor-col-resize" />

          <Panel>
            {selectedChatPhone ? (
              <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 relative">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between bg-white dark:bg-slate-950">
                  <div 
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-2 -ml-2 rounded-md transition-colors"
                    onClick={() => setShowCustomerModal(true)}
                  >
                    <h3 className="font-bold text-lg hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      {selectedConversation?.customer_name || selectedChatPhone}
                    </h3>
                    {selectedConversation?.customer_name && (
                      <span className="text-sm text-slate-500">{selectedChatPhone}</span>
                    )}
                  </div>

                </div>

                <div className="flex-1 overflow-hidden">
                  <SmsThread phone={selectedChatPhone} customerName={selectedConversation?.customer_name} />
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
                <div className="text-center text-slate-400">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                    <MessageSquare className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300">Select a conversation</h3>
                  <p className="text-sm mt-1">Choose a message from the list to view the thread</p>
                </div>
              </div>
            )}
          </Panel>
        </PanelGroup>
      </div>

      <SmsCustomerModal
        open={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        phone={selectedChatPhone}
        customerId={selectedConversation?.customer_id}
        onCustomerSaved={(newCustomer) => {
          // Update local state so it immediately reflects
          setConversations(prev => prev.map(c => 
            c.external_phone === selectedChatPhone 
              ? { ...c, customer_id: newCustomer.id, customer_name: `${newCustomer.first_name || ''} ${newCustomer.last_name || ''}`.trim() || newCustomer.org_name }
              : c
          ));
        }}
      />
    </div>
  );
}
