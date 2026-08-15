import { supabase } from '@/lib/supabase';

export async function searchInventory({ searchTerm, filter = 'all', sortBy = 'part_number', sortDirection = 'asc', limit = 50, offset = 0 }) {
  const { data, error } = await supabase.rpc('search_inventory_ranked', {
    p_search_term: searchTerm,
    p_filter: filter,
    p_sort_by: sortBy,
    p_sort_direction: sortDirection,
    p_limit: limit,
    p_offset: offset
  });
  if (error) throw error;
  const records = (data || []).map(({ total_count, match_rank, ...item }) => item);
  const totalCount = data && data.length > 0 ? Number(data[0].total_count || 0) : 0;
  return { data: { records, total_count: totalCount } };
}
