import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

export default function JsonTreeViewer({ data, name = 'root', depth = 0 }) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  const isObject = data !== null && typeof data === 'object';
  
  if (!isObject) {
    let displayValue = String(data);
    let valueClass = 'text-slate-800 dark:text-slate-200';

    if (typeof data === 'string') {
      displayValue = `"${data}"`;
      valueClass = 'text-green-600 dark:text-green-400';
    } else if (typeof data === 'number') {
      valueClass = 'text-blue-600 dark:text-blue-400';
    } else if (typeof data === 'boolean') {
      valueClass = 'text-purple-600 dark:text-purple-400';
    } else if (data === null) {
      displayValue = 'null';
      valueClass = 'text-red-500 font-semibold';
    }

    return (
      <div className="flex items-start text-xs font-mono py-0.5 leading-tight">
        <span className="text-slate-500 dark:text-slate-400 mr-1 select-none">{name}:</span>
        <span className={`${valueClass} break-all whitespace-pre-wrap`}>{displayValue}</span>
      </div>
    );
  }

  const isArray = Array.isArray(data);
  const keys = Object.keys(data);
  
  if (keys.length === 0) {
    return (
      <div className="flex items-center text-xs font-mono py-0.5 leading-tight">
        <span className="text-slate-500 dark:text-slate-400 mr-1 select-none">{name}:</span>
        <span className="text-slate-400">{isArray ? '[]' : '{}'}</span>
      </div>
    );
  }

  return (
    <div className="text-xs font-mono select-none py-0.5 leading-tight">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded py-0.5 px-1 -ml-1 transition-colors group"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-slate-400 dark:text-slate-500 mr-0.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 mr-0.5 flex-shrink-0" />
        )}
        <span className="text-slate-600 dark:text-slate-400 font-semibold mr-1">{name}</span>
        <span className="text-slate-400 text-[10px]">
          {isArray ? `[${keys.length} items]` : `{${keys.length} keys}`}
        </span>
      </div>
      
      {isExpanded && (
        <div className="border-l border-slate-200 dark:border-slate-800 ml-2 pl-3 mt-0.5 space-y-0.5">
          {keys.map((key) => (
            <JsonTreeViewer 
              key={key} 
              name={key} 
              data={data[key]} 
              depth={depth + 1} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
