import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase, cookieStorage } from '@/lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async (session) => {
      window.__SUPABASE_JWT__ = session?.access_token || null;
      setSession(session);
      setUser(session?.user || null);
      if (session) {
        try {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          const currentMethods = aal?.currentAuthenticationMethods || [];
          const isPasskey = currentMethods.some(m => {
            const methodStr = (typeof m === 'string' ? m : m?.method || '').toLowerCase();
            return methodStr.includes('webauthn') || methodStr.includes('passkey');
          });
          
          const fullyAuth = aal && (aal.currentLevel === aal.nextLevel || isPasskey);
          setIsAuthenticated(fullyAuth);
        } catch (e) {
          console.error("AuthContext AAL check error:", e);
          setIsAuthenticated(true);
        }
      } else {
        setIsAuthenticated(false);
      }
      setIsLoadingAuth(false);
    };

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkAuth(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkAuth(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = () => {
    cookieStorage.removeItem('supabase-auth-token');
    cookieStorage.removeItem('supabase_auth_token');
    window.location.href = 'https://my.kensauto.ca/login?app=autopro';
  };

  const navigateToLogin = () => {
    const currentUrl = encodeURIComponent(window.location.href);
    window.location.href = `https://my.kensauto.ca/login?redirect=${currentUrl}&app=autopro`;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session,
      isAuthenticated, 
      isLoadingAuth,
      logout,
      navigateToLogin
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};