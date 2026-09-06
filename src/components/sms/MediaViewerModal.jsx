import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Download, ZoomIn, ZoomOut, RotateCw, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MediaViewerModal({ isOpen, onClose, mediaUrl, mediaType, mediaName }) {
  const isPdf = mediaType?.toLowerCase().includes('pdf') || mediaUrl?.toLowerCase().endsWith('.pdf');

  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef(null);

  // Reset zoom, pan position, and rotation whenever a new media is opened
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsDragging(false);
    }
  }, [isOpen, mediaUrl]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(5, Number((prev + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(0.5, Number((prev - 0.25).toFixed(2)));
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Mouse wheel zoom
  const handleWheel = (e) => {
    if (isPdf) return;
    const zoomFactor = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom((prev) => {
      const next = Math.min(5, Math.max(0.5, Number((prev + zoomFactor).toFixed(2))));
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  // Double click toggles zoom fit vs 2.5x
  const handleDoubleClick = () => {
    if (isPdf) return;
    if (zoom > 1) {
      handleReset();
    } else {
      setZoom(2.5);
    }
  };

  // Panning handlers
  const handleMouseDown = (e) => {
    if (isPdf || zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || zoom <= 1) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch support for mobile/tablets
  const handleTouchStart = (e) => {
    if (isPdf || zoom <= 1 || e.touches.length !== 1) return;
    setIsDragging(true);
    const touch = e.touches[0];
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

  const handleTouchMove = (e) => {
    if (!isDragging || zoom <= 1 || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPosition({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut();
      } else if (e.key === 'r' || e.key === 'R' || e.key === '0') {
        handleReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen || !mediaUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] p-0 flex flex-col overflow-hidden bg-black/95 border-none shadow-2xl select-none">
        {/* Header toolbar */}
        <div className="h-14 flex items-center justify-between px-4 bg-black/60 backdrop-blur-md text-white shrink-0 z-20 border-b border-white/10">
          <div className="font-medium truncate max-w-md text-sm flex items-center gap-2">
            <span className="truncate">{mediaName || 'Attachment'}</span>
            {!isPdf && zoom !== 1 && (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-600/80 font-mono text-white">
                {Math.round(zoom * 100)}%
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {!isPdf && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-9 w-9"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                  title="Zoom Out (-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>

                <button
                  onClick={handleReset}
                  className="text-xs font-mono font-semibold px-2 py-1 rounded text-white hover:bg-white/20 transition-colors"
                  title="Click to Reset Zoom (100%)"
                >
                  {Math.round(zoom * 100)}%
                </button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-9 w-9"
                  onClick={handleZoomIn}
                  disabled={zoom >= 5}
                  title="Zoom In (+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>

                <div className="w-[1px] h-5 bg-white/20 mx-1" />

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-9 w-9"
                  onClick={handleRotate}
                  title="Rotate 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </Button>

                {(zoom !== 1 || position.x !== 0 || position.y !== 0 || rotation !== 0) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 h-9 w-9"
                    onClick={handleReset}
                    title="Reset Zoom & Position (R)"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                )}

                <div className="w-[1px] h-5 bg-white/20 mx-1" />
              </>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 h-9 w-9"
              onClick={() => window.open(mediaUrl, '_blank')}
              title="Open / Download"
            >
              <Download className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 h-9 w-9"
              onClick={onClose}
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Viewer Area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative flex items-center justify-center p-4"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
        >
          {isPdf ? (
            <iframe
              src={mediaUrl}
              className="w-full h-full rounded-md bg-white border-0"
              title={mediaName || 'PDF Viewer'}
            />
          ) : (
            <div
              className="transition-transform duration-75 ease-out flex items-center justify-center max-w-full max-h-full"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                transformOrigin: 'center center',
              }}
            >
              <img
                src={mediaUrl}
                alt={mediaName || 'Image Viewer'}
                draggable={false}
                className="max-w-full max-h-[85vh] object-contain rounded-md shadow-2xl pointer-events-none select-none"
              />
            </div>
          )}
        </div>

        {/* Helper Hint Footer for non-PDF images */}
        {!isPdf && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[11px] text-white/80 pointer-events-none z-20 flex items-center gap-3">
            <span>Scroll wheel or <kbd className="px-1 bg-white/20 rounded font-mono">+</kbd>/<kbd className="px-1 bg-white/20 rounded font-mono">-</kbd> to zoom</span>
            <span>•</span>
            <span>Double click to toggle</span>
            {zoom > 1 && (
              <>
                <span>•</span>
                <span className="text-blue-300 font-medium">Click & drag to move</span>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

