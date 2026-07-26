import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cookieStorage = {
  getItem: (key) => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  },
  setItem: (key, value) => {
    if (typeof document === 'undefined') return;
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const domainString = isLocalhost ? '' : 'domain=.kensauto.ca; ';
    let cookieString = `${key}=${encodeURIComponent(value)}; path=/; ${domainString}max-age=31536000; SameSite=Lax`;
    if (window.location.protocol === 'https:') {
      cookieString += '; Secure';
    }
    document.cookie = cookieString;
  },
  removeItem: (key) => {
    if (typeof document === 'undefined') return;
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const domainString = isLocalhost ? '' : 'domain=.kensauto.ca; ';
    document.cookie = `${key}=; path=/; ${domainString}expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: cookieStorage,
    storageKey: 'supabase-auth-token',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
