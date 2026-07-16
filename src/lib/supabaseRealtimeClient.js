import { createClient } from '@supabase/supabase-js';

// Hardcode your native Supabase credentials here to completely bypass the missing Base44 function
const url = 'https://hbcrwkmgsazqrvsrmxyr.supabase.co'; // Replace with your actual Supabase URL
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiY3J3a21nc2F6cXJ2c3JteHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzQwNzYsImV4cCI6MjA4ODk1MDA3Nn0.gM3QF4igxy6IH_x4Otd1wvKUUyScNVpYIuGqoc411jU';        // Replace with your actual Supabase Anon Key

let client = null;

export const getSupabaseRealtimeClient = async () => {
  if (!client) {
    client = createClient(url, anonKey);
  }
  return client;
};
