import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MediaViewerModal({ isOpen, onClose, mediaUrl, mediaType, mediaName }) {
  if (!isOpen || !mediaUrl) return null;

  const isPdf = mediaType?.toLowerCase().includes('pdf');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] p-0 flex flex-col overflow-hidden bg-black/95 border-none shadow-none">
        {/* Header toolbar */}
        <div className="h-14 flex items-center justify-between px-4 bg-black/50 text-white shrink-0">
          <div className="font-medium truncate max-w-md">{mediaName || 'Attachment'}</div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white hover:bg-white/20"
              onClick={() => window.open(mediaUrl, '_blank')}
            >
              <Download className="w-5 h-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white hover:bg-white/20"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Viewer Area */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          {isPdf ? (
            <iframe 
              src={mediaUrl} 
              className="w-full h-full rounded-md bg-white" 
              title={mediaName || 'PDF Viewer'}
            />
          ) : (
            <img 
              src={mediaUrl} 
              alt={mediaName || 'Image Viewer'} 
              className="max-w-full max-h-full object-contain rounded-md"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

