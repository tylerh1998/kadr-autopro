import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { supabase } from '@/lib/supabase';

const { appId, serverUrl, functionsVersion } = appParams;

const proxyUrl = import.meta.env.VITE_BASE44_PROXY_URL;

// Helper to synchronously read the Supabase JWT from the cookie
const getSupabaseTokenFromCookie = () => {
  if (typeof document === 'undefined') return null;
  console.log('[Base44 XHR Intercept] document.cookie raw:', document.cookie);
  const match = document.cookie.match(/(?:^|;\s*)supabase-auth-token=([^;]+)/);
  if (match) {
    try {
      let rawValue = decodeURIComponent(match[1]);
      const sessionData = JSON.parse(rawValue);
      // Supabase sometimes wraps the session in an array
      if (Array.isArray(sessionData) && sessionData.length > 0) {
        return sessionData[0]?.access_token || null;
      }
      return sessionData?.access_token || null;
    } catch (e) {
      console.warn("Could not parse supabase-auth-token cookie:", e);
    }
  }
  return null;
};

// 1. Intercept standard Fetch requests
if (typeof window !== 'undefined' && !window.__base44_fetch_intercepted__) {
  window.__base44_fetch_intercepted__ = true;
  const originalFetch = window.fetch;
  window.fetch = async function (url, options = {}) {
    const isBase44Request = typeof url === 'string' && (
      (proxyUrl && url.startsWith(proxyUrl)) || 
      url.includes('/api/apps') || 
      url.includes('/api/entities') || 
      url.includes('/api/functions') || 
      url.includes('/api/app-logs') || 
      url.includes('/api/analytics')
    );

    if (isBase44Request) {
      const jwtToken = window.__SUPABASE_JWT__ || getSupabaseTokenFromCookie();
      if (jwtToken) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${jwtToken}`
        };
      }
    }
    return originalFetch.apply(this, [url, options]);
  };
}

// 2. Intercept XMLHttpRequests (used by Axios in Base44 SDK)
if (typeof window !== 'undefined' && !window.__base44_xhr_intercepted__) {
  window.__base44_xhr_intercepted__ = true;
  
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__url = url;
    return originalOpen.apply(this, [method, url, ...args]);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__url;
    const isBase44Request = typeof url === 'string' && (
      (proxyUrl && url.startsWith(proxyUrl)) || 
      url.includes('/api/apps') || 
      url.includes('/api/entities') || 
      url.includes('/api/functions') || 
      url.includes('/api/app-logs') || 
      url.includes('/api/analytics')
    );

    console.log(`[Base44 XHR Intercept] Intercepted send for URL: ${url}, isBase44Request: ${isBase44Request}`);
    if (isBase44Request) {
      const jwtToken = window.__SUPABASE_JWT__ || getSupabaseTokenFromCookie();
      console.log(`[Base44 XHR Intercept] jwtToken available: ${!!jwtToken}, cookieValue: ${!!getSupabaseTokenFromCookie()}`);
      if (jwtToken) {
        this.setRequestHeader('Authorization', `Bearer ${jwtToken}`);
      }
    }
    return originalSend.apply(this, [body]);
  };
}

// Create the client pointing to our Supabase Proxy URL
export const base44 = createClient({
  appId,
  serverUrl: proxyUrl || serverUrl,
  token: '', // Token is dynamically injected via the interceptors
  functionsVersion,
  requiresAuth: false
});
