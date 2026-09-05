import React, { useState, useEffect, useRef } from 'react';
import { X, Edit, Paperclip, Send, Image as ImageIcon, MessageSquare } from 'lucide-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import moment from 'moment-timezone';
import { supabase } from '@/lib/supabase';
import { getSupabaseRealtimeClient } from '@/lib/supabaseRealtimeClient';

export default function SmsModal({ isOpen, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [selectedChatPhone, setSelectedChatPhone] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const chatEndRef = useRef(null);

  // Fetch Conversations (Chat List)
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

  // Fetch Chat History when a conversation is selected
  useEffect(() => {
    if (!selectedChatPhone) {
      setChatHistory([]);
      return;
    }
    
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const { data, error } = await supabase
          .rpc('get_sms_history', { p_phone: selectedChatPhone });
          
        if (error) {
          console.error('RPC Error:', error);
          throw error;
        }
        if (error) throw error;
        setChatHistory(data || []);
        
        // Mark as read if any inbound are unread
        const unreadInbound = data?.filter(m => m.direction === 'inbound' && !m.is_read);
        if (unreadInbound && unreadInbound.length > 0) {
          const unreadIds = unreadInbound.map(m => m.id);
          await supabase.from('SmsMessage').update({ is_read: true }).in('id', unreadIds);
          
          // Optimistically update conversation list unread status
          setConversations(prev => prev.map(c => 
            c.external_phone === selectedChatPhone ? { ...c, is_unread: false } : c
          ));
        }
      } catch (err) {
        console.error('Error fetching chat history:', err);
      } finally {
        setIsLoadingHistory(false);
        setTimeout(() => scrollToBottom(), 100);
      }
    };
    
    fetchHistory();
  }, [selectedChatPhone]);

  // Realtime Listener
  useEffect(() => {
    if (!isOpen) return;
    let isActive = true;
    let channel = null;

    const setupRealtime = async () => {
      const rtClient = await getSupabaseRealtimeClient();
      if (!isActive) return;

      channel = rtClient.channel('sms_refresh');
      channel.on('broadcast', { event: 'new_sms' }, (message) => {
        const newMsg = message.payload.record;
        if (!newMsg) return;

        const isCurrentChat = 
          newMsg.from_phone === selectedChatPhone || 
          newMsg.to_phone === selectedChatPhone;

        // If it belongs to the currently open chat, append it to history
        if (isCurrentChat) {
          setChatHistory(prev => {
            // Prevent duplicates
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          setTimeout(() => scrollToBottom(), 100);
          
          // Mark as read instantly if it's an inbound message and we have the chat open
          if (newMsg.direction === 'inbound') {
            supabase.from('SmsMessage').update({ is_read: true }).eq('id', newMsg.id).then();
          }
        }

        // Re-fetch conversations to keep the list updated (sort order, last message, unread status)
        fetchConversations();
      });
      channel.subscribe();
    };

    setupRealtime();
    
    return () => {
      isActive = false;
      channel?.unsubscribe();
    };
  }, [isOpen, selectedChatPhone]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!draftMessage.trim() || !selectedChatPhone) return;
    
    setIsSending(true);
    try {
      // Get active session for auth header
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      if (!token) throw new Error("No active session");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/autopro-sendSms`, 
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            to: selectedChatPhone,
            message: draftMessage.trim(),
            subject: 'Chat Message'
          })
        }
      );
      
      const result = await response.json();
      if (!result.success && result.error) {
        throw new Error(result.error);
      }
      
      setDraftMessage('');
      // Note: The UI will update automatically via the broadcast listener!
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send message: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  const selectedConversation = conversations.find(c => c.external_phone === selectedChatPhone);

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Top Nav */}
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 shrink-0 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold">Messages</h2>
          <Button variant="outline" size="sm" className="gap-2">
            <Edit className="w-4 h-4" />
            New Message
          </Button>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          
          {/* Chat List */}
          <Panel defaultSize={30} minSize={20} maxSize={45}>
            <div className="h-full bg-white dark:bg-slate-950 flex flex-col border-r border-slate-200 dark:border-slate-800">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                <input 
                  type="text" 
                  placeholder="Search messages..." 
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {isLoadingList && conversations.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">Loading conversations...</div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">No messages yet.</div>
                ) : (
                  conversations.map((chat) => {
                    const isSelected = selectedChatPhone === chat.external_phone;
                    return (
                      <div 
                        key={chat.external_phone}
                        onClick={() => setSelectedChatPhone(chat.external_phone)}
                        className={`p-4 border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-blue-600 text-white' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-900'
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
                        <p className={`text-sm line-clamp-1 ${isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'} ${(chat.is_unread && !isSelected) ? 'font-bold text-slate-800 dark:text-slate-200' : ''}`}>
                          {chat.last_message}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Panel>

          {/* Drag Handle */}
          <PanelResizeHandle className="w-1 bg-slate-200 dark:bg-slate-800 hover:bg-blue-500 transition-colors cursor-col-resize" />

          {/* Chat String */}
          <Panel>
            {selectedChatPhone ? (
              <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
                {/* Chat Header */}
                <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center px-6 shrink-0 bg-white dark:bg-slate-950 shadow-sm z-10">
                  <h3 className="font-bold text-lg">{selectedConversation?.customer_name || selectedChatPhone}</h3>
                  {selectedConversation?.customer_name && (
                    <span className="ml-2 text-sm text-slate-500">{selectedChatPhone}</span>
                  )}
                </div>

                {/* Message Bubbles */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {isLoadingHistory ? (
                    <div className="text-center text-slate-500 text-sm mt-4">Loading history...</div>
                  ) : (
                    chatHistory.map((msg) => {
                      const isOutbound = msg.direction === 'outbound';
                      
                      // Derive initials
                      let initials = 'EM';
                      if (msg.created_by_name) {
                        const nameParts = msg.created_by_name.split(' ');
                        if (nameParts.length >= 2) {
                          initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
                        } else if (nameParts[0].length >= 2) {
                          initials = nameParts[0].substring(0, 2).toUpperCase();
                        }
                      }

                      return (
                        <div key={msg.id} className={`flex w-full ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                          <div className={`flex max-w-[70%] ${isOutbound ? 'flex-row-reverse' : 'flex-row'} gap-3 items-end`}>
                            
                            {/* Avatar for outbound */}
                            {isOutbound && (
                              <Avatar className="w-8 h-8 shrink-0 mb-1">
                                <AvatarFallback className="bg-slate-300 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                            )}

                            <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
                              <div 
                                className={`px-4 py-2 rounded-2xl ${
                                  isOutbound 
                                    ? 'bg-blue-600 text-white rounded-br-sm' 
                                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-bl-sm shadow-sm'
                                }`}
                              >
                                <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                              </div>
                              <span className="text-[10px] text-slate-400 mt-1 px-1">
                                {moment(msg.created_at).format('MMM D, h:mm a')}
                              </span>
                            </div>

                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 shrink-0">
                  <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
                    <div className="flex items-center gap-1 pb-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-700 shrink-0 rounded-full">
                        <Paperclip className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-700 shrink-0 rounded-full">
                        <ImageIcon className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <textarea 
                      value={draftMessage}
                      onChange={(e) => setDraftMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Type a message..." 
                      className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-2 min-h-[40px] max-h-[150px] text-sm outline-none"
                      rows={1}
                      disabled={isSending}
                    />
                    
                    <div className="pb-1">
                      <Button 
                        size="icon" 
                        onClick={handleSend}
                        className="h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700 shrink-0" 
                        disabled={!draftMessage.trim() || isSending}
                      >
                        <Send className="w-4 h-4 text-white" />
                      </Button>
                    </div>
                  </div>
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
    </div>
  );
}

