import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase, cookieStorage } from '@/lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsEnrollment, setNeedsEnrollment] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async (session) => {
      window.__SUPABASE_JWT__ = session?.access_token || null;
      setSession(session);
      setUser(session?.user || null);

      if (session?.user?.id) {
        const { data: employeeData, error: employeeError } = await supabase
          .from('Employee')
          .select('*')
          .eq('mykadr_user_id', session.user.id)
          .maybeSingle();
        if (employeeError) console.error('AuthContext: Employee lookup failed', employeeError);
        setEmployee(employeeData || null);
      } else {
        setEmployee(null);
      }

      if (session) {
        try {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          const currentMethods = aal?.currentAuthenticationMethods || [];
          const isPasskey = currentMethods.some(m => {
            const methodStr = (typeof m === 'string' ? m : m?.method || '').toLowerCase();
            return methodStr.includes('webauthn') || methodStr.includes('passkey');
          });

          // A zero-factor account has currentLevel === nextLevel === 'aal1',
          // which used to satisfy the equality check below and let it straight
          // into the app - every gated table then silently returned 0 rows
          // (RLS filters, no error). Require an actual step-up to aal2 (or a
          // passkey session, which stays aal1 by design) instead of treating
          // "nothing to step up to" as equivalent to "stepped up."
          const steppedUp = aal && (aal.currentLevel === 'aal2' || isPasskey);
          const noFactorsEnrolled = !!aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal1' && !isPasskey;
          setIsAuthenticated(steppedUp);
          setNeedsEnrollment(noFactorsEnrolled);
        } catch (e) {
          console.error("AuthContext AAL check error:", e);
          // Fail closed, not open - an AAL-check failure used to grant access.
          setIsAuthenticated(false);
          setNeedsEnrollment(false);
        }
      } else {
        setIsAuthenticated(false);
        setNeedsEnrollment(false);
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

  const updateEmployeePrefs = async (updates) => {
    if (!employee?.id) return { data: null, error: new Error('No employee record for current user') };
    const { data, error } = await supabase
      .from('Employee')
      .update(updates)
      .eq('id', employee.id)
      .select()
      .single();
    if (!error) setEmployee(data);
    return { data, error };
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      employee,
      isAuthenticated,
      needsEnrollment,
      isLoadingAuth,
      logout,
      navigateToLogin,
      updateEmployeePrefs
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