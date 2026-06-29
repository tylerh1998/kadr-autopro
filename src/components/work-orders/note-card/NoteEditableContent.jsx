import React, { useEffect, useRef, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const toolbarOptions = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'link'],
  ['clean']
];

const escapeHtml = (value = '') => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeContent = (value = '') => {
  if (!value) return '<p><br></p>';
  if (/<\/?[a-z][\s\S]*>/i.test(value)) return value;
  return `<p>${escapeHtml(value).replace(/\n/g, '<br />')}</p>`;
};

export default function NoteEditableContent({ title = '', comment = '', onSave, containerClassName = '', titleClassName = '', contentClassName = '' }) {
  const wrapperRef = useRef(null);
  const quillRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedValue, setSavedValue] = useState(normalizeContent(comment));
  const [draftValue, setDraftValue] = useState(normalizeContent(comment));

  useEffect(() => {
    const normalized = normalizeContent(comment);
    setSavedValue(normalized);
    setDraftValue(normalized);
  }, [comment]);

  useEffect(() => {
    if (!isEditing) return;

    const focusTimer = window.setTimeout(() => {
      quillRef.current?.getEditor?.().focus();
    }, 0);

    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        void handleSave();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isEditing, draftValue, savedValue]);

  const handleSave = async () => {
    if (isSaving) return;
    if (draftValue === savedValue) {
      setError('');
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onSave?.(draftValue);
      setSavedValue(draftValue);
      setIsEditing(false);
    } catch (saveError) {
      setDraftValue(savedValue);
      setError(saveError?.message || 'Failed to save note.');
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div ref={wrapperRef} className={containerClassName}>
      {title ? <div className={titleClassName}>{title}</div> : null}
      {isEditing ? (
        <div className="space-y-2">
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={draftValue}
            onChange={setDraftValue}
            modules={{ toolbar: toolbarOptions }}
            className="rounded-xl bg-white [&_.ql-container]:min-h-[160px] [&_.ql-container]:rounded-b-xl [&_.ql-container]:border-slate-200 [&_.ql-editor]:min-h-[120px] [&_.ql-toolbar]:rounded-t-xl [&_.ql-toolbar]:border-slate-200"
          />
          <div className="text-xs text-slate-500">{isSaving ? 'Saving…' : 'Click outside to autosave'}</div>
        </div>
      ) : (
        <button type="button" onClick={() => setIsEditing(true)} className="block w-full text-left">
          <div className={`ql-editor min-h-[96px] cursor-text rounded-xl p-0 [&_ol]:pl-6 [&_p]:my-0 [&_ul]:pl-6 ${contentClassName}`} dangerouslySetInnerHTML={{ __html: savedValue }} />
        </button>
      )}
      {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}