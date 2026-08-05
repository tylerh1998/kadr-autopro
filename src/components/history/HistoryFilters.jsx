import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const DEFAULT_HISTORY_FILTERS = {
  daysBack: 365,
  fromDate: "",
  toDate: "",
  search: ""
};

export default function HistoryFilters({
  filters = DEFAULT_HISTORY_FILTERS,
  onApply,
  title = "Search & Filter History",
  description = "Filter by days, date range, or text search."
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    setDraft(filters);
  }, [filters.daysBack, filters.fromDate, filters.toDate, filters.search]);

  const updateField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="no-print rounded-lg border bg-slate-50 dark:bg-slate-800 dark:border-slate-700">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-slate-500 dark:text-slate-400 transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t dark:border-slate-700 px-4 py-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Input type="number" min="0" placeholder="Days Back" value={draft.daysBack} onChange={(e) => updateField("daysBack", e.target.value === "" ? "" : Number(e.target.value))} />
            <Input type="date" value={draft.fromDate} onChange={(e) => updateField("fromDate", e.target.value)} />
            <Input type="date" value={draft.toDate} onChange={(e) => updateField("toDate", e.target.value)} />
            <Input type="text" placeholder="Search" value={draft.search} onChange={(e) => updateField("search", e.target.value)} className="md:col-span-4" />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => onApply?.({ ...draft, daysBack: draft.daysBack === "" ? 365 : Number(draft.daysBack) })}>Apply</Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}