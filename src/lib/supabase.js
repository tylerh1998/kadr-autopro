import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Clean up duplicate host-only cookies on startup to prevent session conflicts
if (typeof window !== 'undefined') {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isLocalhost) {
    // If there are duplicate supabase-auth-token cookies, clear the host-specific one
    const rawCookies = document.cookie.split('; ');
    const authTokens = rawCookies.filter(c => c.trim().startsWith('supabase-auth-token='));
    if (authTokens.length > 1) {
      document.cookie = 'supabase-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  }
}

// Custom storage implementation to use cookies instead of localStorage
export const cookieStorage = {
  getItem: (key) => {
    const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'))
    return match ? match[2] : null
  },
  setItem: (key, value) => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (!isLocalhost) {
      // Clear any host-only cookie first so it doesn't conflict with wildcard
      document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }

    const domainString = isLocalhost ? '' : `domain=.kensauto.ca; `;
    document.cookie = `${key}=${value}; ${domainString}path=/; max-age=31536000; SameSite=Lax; ${
      window.location.protocol === 'https:' ? 'Secure' : ''
    }`
  },
  removeItem: (key) => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const domainString = isLocalhost ? '' : `domain=.kensauto.ca; `;
      
    document.cookie = `${key}=; ${domainString}path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    if (!isLocalhost) {
      // Clear host-only too
      document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: cookieStorage,
    storageKey: 'supabase-auth-token',
    experimental: {
      passkey: true
    }
  }
});
