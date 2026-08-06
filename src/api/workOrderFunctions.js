import { supabase } from '@/lib/supabase';

export async function getworkorderlist(payload = {}) {
  const { data, error } = await supabase.functions.invoke('autopro-getworkorderlist', { body: payload });
  if (error) throw error;
  return { data };
}

export async function createworkorderdata(payload) {
  const { data, error } = await supabase.functions.invoke('autopro-createworkorderdata', { body: payload });
  if (error) throw error;
  return { data };
}
