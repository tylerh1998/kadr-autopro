import React, { useEffect, useRef, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const toolbarOptions = [
  ['bold', 'italic', 'underline', 'strike', { list: 'ordered' }, { list: 'bullet' }]
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
  const titleInputRef = useRef(null);
  const draftTitleRef = useRef(title || '');
  const savedTitleRef = useRef(title || '');
  const draftValueRef = useRef(normalizeContent(comment));
  const savedValueRef = useRef(normalizeContent(comment));
  const isSavingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedTitle, setSavedTitle] = useState(title || '');
  const [draftTitle, setDraftTitle] = useState(title || '');
  const [savedValue, setSavedValue] = useState(normalizeContent(comment));
  const [draftValue, setDraftValue] = useState(normalizeContent(comment));

  useEffect(() => {
    const nextTitle = title || '';
    setSavedTitle(nextTitle);
    setDraftTitle(nextTitle);
    savedTitleRef.current = nextTitle;
    draftTitleRef.current = nextTitle;
  }, [title]);

  useEffect(() => {
    const normalized = normalizeContent(comment);
    setSavedValue(normalized);
    setDraftValue(normalized);
    savedValueRef.current = normalized;
    draftValueRef.current = normalized;
  }, [comment]);

  useEffect(() => {
    draftTitleRef.current = draftTitle;
  }, [draftTitle]);

  useEffect(() => {
    savedTitleRef.current = savedTitle;
  }, [savedTitle]);

  useEffect(() => {
    draftValueRef.current = draftValue;
  }, [draftValue]);

  useEffect(() => {
    savedValueRef.current = savedValue;
  }, [savedValue]);

  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => {
    if (!isEditing) return;

    const focusTitleFirst = !savedTitle;
    const focusTimer = window.setTimeout(() => {
      if (focusTitleFirst) {
        titleInputRef.current?.focus();
        return;
      }
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
  }, [isEditing, savedTitle]);

  const handleSave = async () => {
    if (isSavingRef.current) return;

    const nextDraftTitle = draftTitleRef.current;
    const nextSavedTitle = savedTitleRef.current;
    const nextDraftValue = draftValueRef.current;
    const nextSavedValue = savedValueRef.current;

    if (nextDraftValue === nextSavedValue && nextDraftTitle === nextSavedTitle) {
      setError('');
      setIsEditing(false);
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setError('');

    try {
      const trimmedTitle = nextDraftTitle.trim();
      await onSave?.({
        title: trimmedTitle,
        comment: nextDraftValue
      });
      savedTitleRef.current = trimmedTitle;
      savedValueRef.current = nextDraftValue;
      setSavedTitle(trimmedTitle);
      setSavedValue(nextDraftValue);
      setIsEditing(false);
    } catch (saveError) {
      setDraftTitle(savedTitleRef.current);
      setDraftValue(savedValueRef.current);
      setError(saveError?.message || 'Failed to save note.');
      setIsEditing(false);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div ref={wrapperRef} className={containerClassName}>
      {isEditing ? (
        <div className="space-y-2">
          <input
            ref={titleInputRef}
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder=""
            className={`w-full rounded-none border-0 bg-transparent p-0 shadow-none outline-none focus-visible:ring-0 ${titleClassName}`}
          />
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={draftValue}
            onChange={setDraftValue}
            modules={{ toolbar: toolbarOptions }}
            className="rounded-xl bg-white [&_.ql-container]:min-h-[160px] [&_.ql-container]:rounded-b-xl [&_.ql-container]:border-slate-200 [&_.ql-editor]:min-h-[120px] [&_.ql-toolbar]:flex [&_.ql-toolbar]:flex-nowrap [&_.ql-toolbar]:items-center [&_.ql-toolbar]:gap-1 [&_.ql-toolbar]:overflow-x-auto [&_.ql-toolbar]:rounded-t-xl [&_.ql-toolbar]:border-slate-200 [&_.ql-toolbar]:px-2 [&_.ql-toolbar_.ql-formats]:mr-0 [&_.ql-toolbar_.ql-formats]:flex [&_.ql-toolbar_.ql-toolbar_.ql-formats]:items-center"
          />
          <div className="text-xs text-slate-500">{isSaving ? 'Saving…' : 'Click outside to autosave'}</div>
        </div>
      ) : (
        <div className="space-y-1">
          <button type="button" onClick={() => setIsEditing(true)} className="block w-full text-left">
            <div className={`${titleClassName} ${savedTitle ? '' : 'min-h-[18px]'}`}>{savedTitle || ' '}</div>
          </button>
          <button type="button" onClick={() => setIsEditing(true)} className="block w-full text-left">
            <div className={`ql-editor min-h-[96px] cursor-text rounded-xl p-0 [&_ol]:pl-6 [&_p]:my-0 [&_ul]:pl-6 ${contentClassName}`} dangerouslySetInnerHTML={{ __html: savedValue }} />
          </button>
        </div>
      )}
      {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}