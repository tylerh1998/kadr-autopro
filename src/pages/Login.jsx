import { useState, useEffect } from 'react';
import { supabase, cookieStorage } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { encryptToken, decryptToken } from '../lib/crypto';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savedEmails, setSavedEmails] = useState([]);
  
  // Phase 1 = Email, Phase 1.5 = PIN, Phase 2 = Password, Phase 3 = MFA
  const [loginPhase, setLoginPhase] = useState(1);
  const [encryptedPinToken, setEncryptedPinToken] = useState(null);

  useEffect(() => {
    const parseSavedEmails = () => {
      const cookies = document.cookie.split('; ');
      const emails = [];
      for (const cookie of cookies) {
        const [key] = cookie.split('=');
        if (key.startsWith('kadr_pin_token_')) {
          const savedEmail = key.substring('kadr_pin_token_'.length);
          if (savedEmail) {
            emails.push(savedEmail);
          }
        }
      }
      setSavedEmails(emails);
    };
    parseSavedEmails();
  }, []);

  const handleSavedEmailClick = (savedEmail) => {
    setEmail(savedEmail);
    const storedPinToken = cookieStorage.getItem(`kadr_pin_token_${savedEmail}`);
    if (storedPinToken) {
      setEncryptedPinToken(storedPinToken);
      setLoginPhase(1.5);
    }
  };
  
  // Enrolled factors state
  const [hasPasskey, setHasPasskey] = useState(false);
  const [hasTotp, setHasTotp] = useState(false);
  
  // Forgot Password state
  const [showForgotPwd, setShowForgotPwd] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState({ type: '', text: '' });

  // MFA State
  const [mfaCode, setMfaCode] = useState('');
  const [factorId, setFactorId] = useState(null);

  const navigate = useNavigate();

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const cleanEmail = email.trim().toLowerCase();

    // Check if soft-PIN token cookie exists for this email
    const storedPinToken = cookieStorage.getItem(`kadr_pin_token_${cleanEmail}`);
    if (storedPinToken) {
      setEncryptedPinToken(storedPinToken);
      setLoginPhase(1.5);
      setLoading(false);
      return;
    }

    try {
      // Check user factors
      const { data: checkData, error: checkError } = await supabase.rpc('check_user_factors', { user_email: cleanEmail });
      if (checkError) throw checkError;
      
      const userHasPasskey = !!checkData?.[0]?.has_passkey;
      const userHasTotp = !!checkData?.[0]?.has_totp;
      
      setHasPasskey(userHasPasskey);
      setHasTotp(userHasTotp);

      if (userHasPasskey) {
        if (supabase.auth.signInWithPasskey) {
          const res = await supabase.auth.signInWithPasskey({ email: cleanEmail });
          console.log("Passkey sign-in result:", res);
          if (!res.error) {
            // Successfully logged in with Passkey!
            navigate('/');
            return;
          }
          console.error("Passkey login failed:", res.error);
          setError(`Passkey login error: ${res.error.message || JSON.stringify(res.error)}`);
        }
      }
      
      // Fall back to password
      setLoginPhase(2);
    } catch (err) {
      console.error("Error checking factors / passkey:", err);
      // Fall back to password
      setLoginPhase(2);
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const cleanEmail = email.trim().toLowerCase();

    try {
      const decryptedToken = await decryptToken(pin, cleanEmail, encryptedPinToken);
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: decryptedToken });
      
      if (error) throw error;
      
      if (data.session) {
        // Re-encrypt the newly issued refresh token so the PIN keeps working
        const newEncrypted = await encryptToken(pin, cleanEmail, data.session.refresh_token);
        cookieStorage.setItem(`kadr_pin_token_${cleanEmail}`, newEncrypted);
        navigate('/');
      } else {
        throw new Error("Session could not be established.");
      }
    } catch (err) {
      console.error(err);
      setError("Incorrect PIN, or session expired.");
      // Fallback to password after a short delay
      setTimeout(() => {
        setLoginPhase(2);
        setError(null);
        setPin('');
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const cleanEmail = email.trim().toLowerCase();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) throw error;

      // Check if user has TOTP enrolled (enforced at app-level)
      if (hasTotp) {
        const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        
        const totpFactor = factors?.totp?.find(f => f.status === 'verified');
        if (totpFactor) {
          setFactorId(totpFactor.id);
          setLoginPhase(3);
          setLoading(false);
          return;
        }
      }

      navigate('/'); // Redirect after login
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      
      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: mfaCode,
      });
      if (verify.error) throw verify.error;
      
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMessage({ type: '', text: '' });

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin + '/update-password',
      });
      if (error) throw error;
      
      setResetMessage({ 
        type: 'success', 
        text: 'Password reset email sent! Check your inbox for the link.' 
      });
    } catch (err) {
      setResetMessage({ type: 'error', text: err.message });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-400 flex items-center justify-center p-4 relative">
      <div className="w-full max-w-sm bg-white rounded-2xl p-10 shadow-2xl relative z-10">
        <div className="text-center mb-8">
          <img src="/logo.jpg" alt="KADR Logo" className="h-16 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-[#1a2542] mb-0.5">
            myKADR Login
          </h1>
          <p className="text-sm font-semibold text-gray-500 tracking-wider uppercase">
            AutoPRO
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 text-sm p-3 rounded-lg mb-6 text-center">
            {error}
          </div>
        )}



        {loginPhase === 1 && (
          <>
            {savedEmails.length > 0 && (
              <div className="mb-6 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Saved Accounts</p>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {savedEmails.map((savedEmail) => {
                    const initials = savedEmail.split('@')[0].split('.').slice(0, 2).map(p => p[0]).join('').toUpperCase() || savedEmail[0].toUpperCase();
                    return (
                      <button
                        key={savedEmail}
                        type="button"
                        onClick={() => handleSavedEmailClick(savedEmail)}
                        className="flex items-center gap-3 w-full bg-gray-50 hover:bg-gray-100/80 p-3 rounded-xl border border-gray-100 text-left transition-all group focus:outline-none focus:ring-2 focus:ring-[#1fa291]"
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1fa291] to-[#157165] flex items-center justify-center text-white font-bold text-xs shadow-sm">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-700 truncate group-hover:text-[#1fa291] transition-colors">
                            {savedEmail}
                          </p>
                        </div>
                        <svg className="w-4 h-4 text-gray-400 group-hover:text-[#1fa291] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-gray-200"></div>
                  <span className="flex-shrink mx-4 text-gray-400 text-xs uppercase font-semibold tracking-wider">Or enter email</span>
                  <div className="flex-grow border-t border-gray-200"></div>
                </div>
              </div>
            )}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#eef0f3] border-none rounded-lg pl-10 pr-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1fa291] transition-all"
                  placeholder="Email"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1fa291] hover:bg-[#188577] text-white font-medium py-3 px-4 rounded-lg shadow-md transition-all mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Checking...' : 'Next'}
              </button>
            </form>
          </>
        )}

        {loginPhase === 1.5 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#1a2542] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-900/20">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">Welcome Back</h2>
              <p className="text-sm text-gray-500 font-medium">Enter your 4-digit PIN for {email}</p>
            </div>
            <form onSubmit={handlePinSubmit} className="space-y-6">
              <div className="relative">
                <input
                  type="password"
                  maxLength="4"
                  pattern="\d{4}"
                  autoFocus
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full bg-[#eef0f3] border-none rounded-lg py-3 text-center text-2xl font-bold tracking-[1.5em] pl-[1.5em] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1fa291] transition-all"
                  placeholder="••••"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setLoginPhase(2);
                    setError(null);
                    setPin('');
                  }}
                  className="w-1/2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-4 rounded-lg transition-all"
                >
                  Use Password
                </button>
                <button
                  type="submit"
                  disabled={loading || pin.length !== 4}
                  className="w-1/2 bg-[#1fa291] hover:bg-[#188577] text-white font-medium py-3 px-4 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Verifying...' : 'Log In'}
                </button>
              </div>
            </form>
          </div>
        )}

        {loginPhase === 2 && (
          <>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="text-sm text-gray-600 mb-4 flex justify-between items-center bg-gray-100 p-2 rounded">
                <span className="truncate mr-2">{email}</span>
                <button 
                  type="button" 
                  onClick={() => { setLoginPhase(1); setError(null); }} 
                  className="text-[#1fa291] hover:underline text-xs whitespace-nowrap"
                >
                  Change
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input type="hidden" name="email" value={email} autoComplete="username" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#eef0f3] border-none rounded-lg pl-10 pr-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1fa291] transition-all"
                  placeholder="Password"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1fa291] hover:bg-[#188577] text-white font-medium py-3 px-4 rounded-lg shadow-md transition-all mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Logging In...' : 'Log In'}
              </button>
            </form>
            
            <div className="mt-6 text-center text-sm">
              <button
                type="button"
                onClick={() => setShowForgotPwd(true)}
                className="text-gray-500 hover:text-gray-700 font-medium transition-colors"
              >
                Forgot Password?
              </button>
            </div>
          </>
        )}

        {loginPhase === 3 && (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <p className="text-sm text-gray-600 mb-4 text-center">
              Please enter the 6-digit code from your authenticator app to continue.
            </p>
            <div className="relative">
              <input
                type="text"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="w-full bg-[#eef0f3] border-none rounded-lg px-4 py-3 text-gray-800 text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-[#1fa291] transition-all"
                placeholder="000000"
                required
                autoFocus
              />
            </div>
            
            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full bg-[#1a2542] hover:bg-[#11192d] text-white font-medium py-3 px-4 rounded-lg shadow-md transition-all mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>
            
            <div className="mt-4 text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setLoginPhase(2);
                  setMfaCode('');
                  setError(null);
                }}
                className="text-gray-500 hover:text-gray-700 font-medium transition-colors"
              >
                Back to Password
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Forgot Password Modal */}
      {showForgotPwd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full">
            <h3 className="text-xl font-bold text-[#1a2542] mb-2">Reset Password</h3>
            <p className="text-sm text-gray-500 mb-6">Enter your email address and we'll send you a link to reset your password.</p>
            
            {resetMessage.text && (
              <div className={`p-4 rounded-md mb-6 text-sm ${resetMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {resetMessage.text}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <input 
                  type="email"
                  required
                  placeholder="Email address"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full bg-[#eef0f3] border-none rounded-md px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1fa291]"
                />
              </div>
              
              <div className="flex flex-col gap-3 pt-2">
                <button 
                  type="submit"
                  disabled={resetLoading}
                  className="w-full bg-[#1fa291] hover:bg-[#188577] text-white py-3 rounded-md font-medium transition-colors disabled:opacity-50"
                >
                  {resetLoading ? 'Sending Link...' : 'Send Reset Link'}
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setShowForgotPwd(false);
                    setResetMessage({ type: '', text: '' });
                    setResetEmail('');
                  }}
                  className="w-full py-2 text-gray-500 hover:text-gray-800 font-medium transition-colors"
                >
                  Back to Login
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
