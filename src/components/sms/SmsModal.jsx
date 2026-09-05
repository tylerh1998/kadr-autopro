import React, { useState, useEffect, useRef } from 'react';
import { X, Edit, Paperclip, Send, Image as ImageIcon, MessageSquare, XCircle, FileText } from 'lucide-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import moment from 'moment-timezone';
import { supabase } from '@/lib/supabase';
import { getSupabaseRealtimeClient } from '@/lib/supabaseRealtimeClient';

import NewSmsDialog from './NewSmsDialog';
import MediaViewerModal from './MediaViewerModal';

export default function SmsModal({ isOpen, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [selectedChatPhone, setSelectedChatPhone] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Attachments State
  const [pendingFiles, setPendingFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // New Dialog State
  const [showNewDialog, setShowNewDialog] = useState(false);

  // Viewer State
  const [viewerMedia, setViewerMedia] = useState(null);

  const chatEndRef = useRef(null);

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
    if (!selectedChatPhone) {
      setChatHistory([]);
      return;
    }
    
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const { data, error } = await supabase.rpc('get_sms_history', { p_phone: selectedChatPhone });
        if (error) throw error;
        setChatHistory(data || []);
        
        const unreadInbound = data?.filter(m => m.direction === 'inbound' && !m.is_read);
        if (unreadInbound && unreadInbound.length > 0) {
          const unreadIds = unreadInbound.map(m => m.id);
          await supabase.from('SmsMessage').update({ is_read: true }).in('id', unreadIds);
          
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

        if (isCurrentChat) {
          setChatHistory(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          setTimeout(() => scrollToBottom(), 100);
          
          if (newMsg.direction === 'inbound') {
            supabase.from('SmsMessage').update({ is_read: true }).eq('id', newMsg.id).then();
          }
        }
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

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPendingFiles(prev => [...prev, ...files]);
    e.target.value = null; // Reset
  };

  const removePendingFile = (idx) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const uploadFiles = async () => {
    if (!pendingFiles.length) return [];
    setIsUploading(true);
    const mediaUrls = [];
    
    try {
      for (const file of pendingFiles) {
        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const filePath = `outbound/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('sms-media')
          .upload(filePath, file, { contentType: file.type });
          
        if (uploadError) throw uploadError;
        
        const { data: publicUrlData } = supabase.storage
          .from('sms-media')
          .getPublicUrl(filePath);
          
        mediaUrls.push(publicUrlData.publicUrl);
      }
      return mediaUrls;
    } catch (err) {
      console.error('Error uploading files:', err);
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if ((!draftMessage.trim() && !pendingFiles.length) || !selectedChatPhone) return;
    
    setIsSending(true);
    try {
      let uploadedMediaUrls = [];
      if (pendingFiles.length > 0) {
        uploadedMediaUrls = await uploadFiles();
      }

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
            subject: 'Chat Message',
            mediaUrls: uploadedMediaUrls
          })
        }
      );
      
      const result = await response.json();
      if (!result.success && result.error) throw new Error(result.error);
      
      setDraftMessage('');
      setPendingFiles([]);
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send message: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  const selectedConversation = conversations.find(c => c.external_phone === selectedChatPhone);

  const renderAttachment = (att, index) => {
    const isPdf = att.type?.toLowerCase().includes('pdf') || att.url?.toLowerCase().endsWith('.pdf');
    return (
      <div 
        key={index} 
        className="mt-2 cursor-pointer bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity"
        onClick={() => setViewerMedia({ url: att.url, type: att.type, name: att.name })}
      >
        {isPdf ? (
          <div className="flex items-center gap-2 p-3 text-slate-700 dark:text-slate-200">
            <FileText className="w-8 h-8 text-red-500 shrink-0" />
            <span className="text-sm font-medium truncate max-w-[200px]">{att.name || 'Document.pdf'}</span>
          </div>
        ) : (
          <img src={att.url} alt={att.name || 'Attachment'} className="max-w-full h-auto max-h-48 object-cover" />
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      
      <NewSmsDialog 
        isOpen={showNewDialog} 
        onClose={() => setShowNewDialog(false)}
        onStartChat={(phone) => setSelectedChatPhone(phone)}
      />

      <MediaViewerModal
        isOpen={!!viewerMedia}
        onClose={() => setViewerMedia(null)}
        mediaUrl={viewerMedia?.url}
        mediaType={viewerMedia?.type}
        mediaName={viewerMedia?.name}
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
              <div className="flex-1 overflow-y-auto">
                {isLoadingList && conversations.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">Loading conversations...</div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">No messages yet.</div>
                ) : (
                  conversations.map((chat) => {
                    const isSelected = selectedChatPhone === chat.external_phone;
                    // Attempt to show attachment previews instead of blank text if body is empty
                    const previewText = chat.last_message || 'Attachment received';
                    return (
                      <div 
                        key={chat.external_phone}
                        onClick={() => setSelectedChatPhone(chat.external_phone)}
                        className={`p-4 border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors ${
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
                        <p className={`text-sm line-clamp-1 ${isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'} ${(chat.is_unread && !isSelected) ? 'font-bold text-slate-800 dark:text-slate-200' : ''}`}>
                          {previewText}
                        </p>
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
                <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center px-6 shrink-0 bg-white dark:bg-slate-950 shadow-sm z-10">
                  <h3 className="font-bold text-lg">{selectedConversation?.customer_name || selectedChatPhone}</h3>
                  {selectedConversation?.customer_name && (
                    <span className="ml-2 text-sm text-slate-500">{selectedChatPhone}</span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {isLoadingHistory ? (
                    <div className="text-center text-slate-500 text-sm mt-4">Loading history...</div>
                  ) : (
                    chatHistory.map((msg) => {
                      const isOutbound = msg.direction === 'outbound';
                      let initials = 'EM';
                      if (msg.created_by_name) {
                        const nameParts = msg.created_by_name.split(' ');
                        if (nameParts.length >= 2) initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
                        else if (nameParts[0].length >= 2) initials = nameParts[0].substring(0, 2).toUpperCase();
                      }

                      return (
                        <div key={msg.id} className={`flex w-full ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                          <div className={`flex max-w-[75%] ${isOutbound ? 'flex-row-reverse' : 'flex-row'} gap-3 items-end`}>
                            {isOutbound && (
                              <Avatar className="w-8 h-8 shrink-0 mb-1">
                                <AvatarFallback className="bg-slate-300 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                            )}

                            <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
                              <div 
                                className={`p-1 rounded-2xl ${
                                  isOutbound 
                                    ? 'bg-blue-600 text-white rounded-br-sm' 
                                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-bl-sm shadow-sm'
                                }`}
                              >
                                {msg.body && <p className="text-sm whitespace-pre-wrap px-3 py-1.5">{msg.body}</p>}
                                
                                {msg.attachments && msg.attachments.length > 0 && (
                                  <div className="px-1 pb-1">
                                    {msg.attachments.map((att, i) => renderAttachment(att, i))}
                                  </div>
                                )}
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

                {/* Pending Uploads Preview */}
                {pendingFiles.length > 0 && (
                  <div className="absolute bottom-[72px] left-4 right-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg rounded-t-xl p-3 flex gap-3 overflow-x-auto z-20">
                    {pendingFiles.map((file, idx) => (
                      <div key={idx} className="relative group shrink-0 w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
                        <Button 
                          variant="destructive" 
                          size="icon" 
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removePendingFile(idx)}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                        {file.type.includes('pdf') ? (
                          <>
                            <FileText className="w-8 h-8 text-red-500 mb-1" />
                            <span className="text-[10px] px-1 truncate w-full text-center">{file.name}</span>
                          </>
                        ) : (
                          <img src={URL.createObjectURL(file)} className="w-full h-full object-cover rounded-md" />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 shrink-0 z-30">
                  <input 
                    type="file" 
                    multiple 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                  />
                  <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
                    <div className="flex items-center gap-1 pb-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-slate-500 hover:text-slate-700 shrink-0 rounded-full"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="w-4 h-4" />
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
                      disabled={isSending || isUploading}
                    />
                    
                    <div className="pb-1">
                      <Button 
                        size="icon" 
                        onClick={handleSend}
                        className="h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700 shrink-0" 
                        disabled={(!draftMessage.trim() && !pendingFiles.length) || isSending || isUploading}
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

