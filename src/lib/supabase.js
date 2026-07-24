import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Strictly purge all session storage and cookies when visiting the login page to guarantee zero account crossover
if (typeof window !== 'undefined') {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (window.location.pathname.toLowerCase() === '/login') {
    const keys = ['supabase-auth-token', 'supabase_auth_token'];
    const domains = ['', 'domain=.kensauto.ca; ', 'domain=kensauto.ca; '];
    
    keys.forEach(key => {
      // Clear localStorage
      localStorage.removeItem(key);
      // Clear cookies across all potential domains
      domains.forEach(domain => {
        document.cookie = `${key}=; ${domain}path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      });
    });
  } else if (!isLocalhost) {
    // Clean up duplicate cookies on startup on non-login pages
    const rawCookies = document.cookie.split('; ');
    const authTokens = rawCookies.filter(c => c.trim().startsWith('supabase_auth_token='));
    if (authTokens.length > 1) {
      document.cookie = 'supabase_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
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
    storageKey: 'supabase_auth_token',
    experimental: {
      passkey: true
    }
  }
});
