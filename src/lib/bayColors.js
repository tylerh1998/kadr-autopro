// Single source of truth for bay-based appointment coloring on the Schedule calendar.
// Every entry pairs a light-mode shade with an equivalent dark-mode shade so a given
// bay reads as "the same color" regardless of theme.
export const BAY_COLOR_CLASSES = {
  'Floor': 'bg-orange-200 border-orange-400 text-orange-950 dark:bg-orange-900 dark:border-orange-500 dark:text-orange-100',
  'Main Floor': 'bg-orange-200 border-orange-400 text-orange-950 dark:bg-orange-900 dark:border-orange-500 dark:text-orange-100',
  'Main Hoist': 'bg-green-200 border-green-400 text-green-950 dark:bg-green-900 dark:border-green-500 dark:text-green-100',
  'North Floor': 'bg-purple-200 border-purple-400 text-purple-950 dark:bg-purple-900 dark:border-purple-500 dark:text-purple-100',
  'North Hoist': 'bg-yellow-200 border-yellow-400 text-yellow-950 dark:bg-yellow-800 dark:border-yellow-500 dark:text-yellow-100',
  'Outside': 'bg-slate-200 border-slate-400 text-slate-950 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100',
  'Other': 'bg-pink-200 border-pink-400 text-pink-950 dark:bg-pink-900 dark:border-pink-500 dark:text-pink-100',
};

export const DEFAULT_BAY_COLOR_CLASS = 'bg-slate-200 border-slate-400 text-slate-950 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100';

export function getBayColorClass(bay) {
  return BAY_COLOR_CLASSES[bay] || DEFAULT_BAY_COLOR_CLASS;
}
