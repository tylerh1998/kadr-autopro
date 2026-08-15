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

const editorThemeVars = {
  white: { accent: '#64748b', soft: 'rgba(100, 116, 139, 0.14)' },
  blue: { accent: '#2563eb', soft: 'rgba(59, 130, 246, 0.16)' },
  green: { accent: '#15803d', soft: 'rgba(34, 197, 94, 0.16)' },
  yellow: { accent: '#a16207', soft: 'rgba(234, 179, 8, 0.18)' },
  pink: { accent: '#be185d', soft: 'rgba(236, 72, 153, 0.16)' }
};

export default function NoteEditableContent({ title = '', comment = '', onSave, editorTheme = 'white', containerClassName = '', titleClassName = '', contentClassName = '' }) {
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

  const activeEditorTheme = editorThemeVars[editorTheme] || editorThemeVars.white;

  return (
    <div
      ref={wrapperRef}
      className={`note-editor ${containerClassName}`}
      style={{
        '--note-editor-accent': activeEditorTheme.accent,
        '--note-editor-accent-soft': activeEditorTheme.soft
      }}
    >
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
            className="note-editor-quill rounded-xl bg-white dark:bg-slate-800 [&_.ql-container]:min-h-[160px] [&_.ql-container]:rounded-b-xl [&_.ql-container]:border-slate-200 dark:[&_.ql-container]:border-slate-600 [&_.ql-editor]:min-h-[120px] [&_.ql-toolbar]:rounded-t-xl [&_.ql-toolbar]:border-slate-200 dark:[&_.ql-toolbar]:border-slate-600 [&_.ql-toolbar]:px-2"
          />
          <div className="text-xs text-slate-500 dark:text-slate-400">{isSaving ? 'Saving…' : 'Click outside to autosave'}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {savedTitle && (
            <button type="button" onClick={() => setIsEditing(true)} className="block w-full text-left">
              <div className={titleClassName}>{savedTitle}</div>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left transition-colors hover:border-slate-300 dark:hover:border-slate-600"
          >
            <div className={`ql-editor min-h-[120px] cursor-text rounded-xl px-3 py-2 [&_ol]:pl-6 [&_p]:my-0 [&_ul]:pl-6 ${contentClassName}`} dangerouslySetInnerHTML={{ __html: savedValue }} />
          </button>
        </div>
      )}
      {error ? <div className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</div> : null}
    </div>
  );
}