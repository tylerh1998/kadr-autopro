import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, Send, Image as ImageIcon, MessageSquare, XCircle, FileText, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import moment from 'moment-timezone';
import { supabase } from '@/lib/supabase';
import MediaViewerModal from './MediaViewerModal';

export default function SmsThread({ phone, customerName }) {
  const [chatHistory, setChatHistory] = useState([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Attachments State
  const [pendingFiles, setPendingFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  // Viewer State
  const [viewerMedia, setViewerMedia] = useState(null);

  const chatEndRef = useRef(null);

  const fetchHistory = async (targetPhone = phone) => {
    if (!targetPhone) {
      setChatHistory([]);
      return;
    }
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase.rpc('get_sms_history', { p_phone: targetPhone });
      if (error) throw error;
      setChatHistory(data || []);
      
      const unreadInbound = data?.filter(m => m.direction === 'inbound' && !m.is_read);
      if (unreadInbound && unreadInbound.length > 0) {
        const unreadIds = unreadInbound.map(m => m.id);
        await supabase.from('SmsMessage').update({ is_read: true }).in('id', unreadIds);
        
        window.dispatchEvent(new CustomEvent('remove-unread-sms', { detail: { phone: targetPhone } }));
      }
    } catch (err) {
      console.error('Error fetching chat history:', err);
    } finally {
      setIsLoadingHistory(false);
      setTimeout(() => scrollToBottom(), 100);
    }
  };

  useEffect(() => {
    fetchHistory(phone);
  }, [phone]);

  const phoneRef = useRef(phone);
  useEffect(() => {
    phoneRef.current = phone;
  }, [phone]);

  useEffect(() => {
    const handleNewSms = (e) => {
      const newMsg = e.detail?.record;
      const currentPhone = phoneRef.current;
      if (newMsg && currentPhone && (newMsg.from_phone === currentPhone || newMsg.to_phone === currentPhone)) {
        fetchHistory(currentPhone);
      }
    };

    window.addEventListener('new-sms-received', handleNewSms);
    return () => window.removeEventListener('new-sms-received', handleNewSms);
  }, []);

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

  const uploadFiles = async (files = pendingFiles) => {
    if (!files.length) return [];
    setIsUploading(true);
    const mediaUrls = [];
    
    try {
      for (const file of files) {
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
    if ((!draftMessage.trim() && !pendingFiles.length) || !phone) return;
    
    setIsSending(true);
    
    // Create optimistic message
    const tempId = 'temp-' + Date.now();
    const optimisticMsg = {
      id: tempId,
      body: draftMessage.trim(),
      direction: 'outbound',
      status: 'sending',
      created_at: new Date().toISOString(),
      created_by_name: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : '',
      attachments: pendingFiles.map(f => ({
        name: f.name,
        type: f.type,
        url: URL.createObjectURL(f)
      }))
    };
    
    // Append to UI immediately
    setChatHistory(prev => [...prev, optimisticMsg]);
    setDraftMessage('');
    const filesToUpload = [...pendingFiles];
    setPendingFiles([]);
    
    setTimeout(scrollToBottom, 50);

    try {
      let uploadedMediaUrls = [];
      if (filesToUpload.length > 0) {
        setIsUploading(true);
        // Upload logic needs the actual files, so we pass filesToUpload if uploadFiles takes them,
        // Wait, uploadFiles uses pendingFiles state. Let's adapt uploadFiles to take an argument, or inline it.
        // To be safe without modifying uploadFiles too much, let's pass files to a helper or just inline the upload.
        // Actually, uploadFiles relies on pendingFiles state. 
        // Let's modify uploadFiles to accept an optional array.
        uploadedMediaUrls = await uploadFiles(filesToUpload);
        setIsUploading(false);
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
            to: phone,
            message: optimisticMsg.body,
            subject: 'Chat Message',
            mediaUrls: uploadedMediaUrls
          })
        }
      );
      
      const result = await response.json();
      if (!result.success && result.error) throw new Error(result.error);
      
      // Update optimistic message status
      setChatHistory(prev => prev.map(msg => 
        msg.id === tempId ? { ...msg, status: 'sent', id: result.data?.id || tempId } : msg
      ));
      
    } catch (err) {
      console.error('Error sending message:', err);
      // Mark as failed
      setChatHistory(prev => prev.map(msg => 
        msg.id === tempId ? { ...msg, status: 'failed' } : msg
      ));
    } finally {
      setIsSending(false);
    }
  };

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
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 relative">
      <MediaViewerModal
        isOpen={!!viewerMedia}
        onClose={() => setViewerMedia(null)}
        mediaUrl={viewerMedia?.url}
        mediaType={viewerMedia?.type}
        mediaName={viewerMedia?.name}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingHistory ? (
          <div className="text-center text-slate-500 text-sm mt-4">Loading history...</div>
        ) : chatHistory.length === 0 ? (
          <div className="text-center text-slate-500 text-sm mt-4">No messages yet. Say hi!</div>
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
                <div className={`flex max-w-[85%] ${isOutbound ? 'flex-row-reverse' : 'flex-row'} gap-2 items-end`}>
                  {isOutbound && (
                    <Avatar className="w-6 h-6 shrink-0 mb-1">
                      <AvatarFallback className="bg-slate-300 dark:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200">
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
                      <span className="text-[10px] text-slate-400 mt-1 px-1 flex items-center gap-1">
                        {msg.status === 'sending' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Sending...
                          </>
                        ) : msg.status === 'failed' ? (
                          <span className="text-red-500 font-medium">Failed to send</span>
                        ) : (
                          moment(msg.created_at).format('MMM D, h:mm a')
                        )}
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
        <div className="absolute bottom-[60px] left-2 right-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg rounded-xl p-2 flex gap-2 overflow-x-auto z-20">
          {pendingFiles.map((file, idx) => (
            <div key={idx} className="relative group shrink-0 w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
              <Button 
                variant="destructive" 
                size="icon" 
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removePendingFile(idx)}
              >
                <XCircle className="w-3 h-3" />
              </Button>
              {file.type.includes('pdf') ? (
                <>
                  <FileText className="w-6 h-6 text-red-500 mb-1" />
                  <span className="text-[8px] px-1 truncate w-full text-center">{file.name}</span>
                </>
              ) : (
                <img src={URL.createObjectURL(file)} className="w-full h-full object-cover rounded-md" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="p-3 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 shrink-0 z-30">
        <input 
          type="file" 
          multiple 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*,application/pdf"
          onChange={handleFileChange}
        />
        <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
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
            className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-2 min-h-[36px] max-h-[100px] text-sm outline-none"
            rows={1}
            disabled={isSending || isUploading}
          />
          
          <div className="pb-1 pr-1">
            <Button 
              size="icon" 
              onClick={handleSend}
              className="h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700 shrink-0" 
              disabled={(!draftMessage.trim() && !pendingFiles.length) || isSending || isUploading}
            >
              <Send className="w-3 h-3 text-white" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
