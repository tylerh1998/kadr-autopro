import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function NotesStatusBar({ currentFilter, onFilterChange, counts, onAddNote, isCreating }) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <Tabs value={currentFilter} onValueChange={onFilterChange} className="flex-1">
        <TabsList className="flex w-full bg-transparent p-0">
          <TabsTrigger value="shared" className="flex-1 flex items-center justify-center gap-2 bg-slate-200 text-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-md m-0.5">
            <span>Shared</span>
            <Badge variant="outline" className="bg-white text-slate-900 border-slate-400">{counts.shared}</Badge>
          </TabsTrigger>
          <TabsTrigger value="private" className="flex-1 flex items-center justify-center gap-2 bg-amber-100 text-amber-900 data-[state=active]:bg-amber-500 data-[state=active]:text-white rounded-md m-0.5">
            <span>Private</span>
            <Badge variant="outline" className="bg-white text-amber-700 border-amber-400">{counts.private}</Badge>
          </TabsTrigger>
          <TabsTrigger value="archived" className="flex-1 flex items-center justify-center gap-2 bg-gray-300 text-gray-900 data-[state=active]:bg-gray-600 data-[state=active]:text-white rounded-md m-0.5">
            <span>Archived</span>
            <Badge variant="outline" className="bg-white text-gray-600 border-gray-400">{counts.archived}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Button onClick={onAddNote} disabled={isCreating} className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap">
        <Plus className="w-4 h-4 mr-2" />
        {isCreating ? 'Adding...' : 'Add Note'}
      </Button>
    </div>
  );
}