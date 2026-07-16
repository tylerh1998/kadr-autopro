import { createClient } from '@supabase/supabase-js';
import { base44 } from '@/api/base44Client';

let clientPromise = null;

export const getSupabaseRealtimeClient = async () => {
  if (!clientPromise) {
    clientPromise = base44.functions.invoke('getSupabaseRealtimeConfig').then((response) => {
      const { url, anonKey, error } = response.data || {};

      if (error) {
        throw new Error(error);
      }

      if (!url || !anonKey) {
        throw new Error('Supabase realtime configuration is unavailable');
      }

      return createClient(url, anonKey);
    });
  }

  return clientPromise;
};