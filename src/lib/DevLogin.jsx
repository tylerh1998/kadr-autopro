import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const DEV_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true';

export default function DevLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('credentials'); // 'credentials' | 'mfa'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!DEV_LOGIN_ENABLED) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  if (!DEV_LOGIN_ENABLED) return null;

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    // No-factor accounts navigate straight through, same as before this
    // change - only a session whose next AAL is aal2 needs the extra step.
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setLoading(false);
    if (aalError) {
      setError(aalError.message);
      return;
    }
    if (aal.nextLevel === 'aal2' && aal.currentLevel !== aal.nextLevel) {
      setStep('mfa');
      return;
    }
    navigate('/', { replace: true });
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      setLoading(false);
      setError(factorsError.message);
      return;
    }
    const totpFactor = factorsData?.totp?.find((f) => f.status === 'verified');
    if (!totpFactor) {
      setLoading(false);
      setError('No verified TOTP factor found for this account.');
      return;
    }
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: totpFactor.id,
    });
    if (challengeError) {
      setLoading(false);
      setError(challengeError.message);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code,
    });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    navigate('/', { replace: true });
  };

  if (step === 'mfa') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <form onSubmit={handleMfaSubmit} className="w-80 space-y-3 bg-white dark:bg-slate-900 p-6 rounded shadow border border-amber-400 dark:border-amber-600">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Dev-branch login — test environment only</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">Enter your 6-digit TOTP code.</p>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="w-full border rounded px-2 py-1 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
            autoFocus
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-800 dark:bg-slate-700 text-white rounded px-2 py-1 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-950">
      <form onSubmit={handleCredentialsSubmit} className="w-80 space-y-3 bg-white dark:bg-slate-900 p-6 rounded shadow border border-amber-400 dark:border-amber-600">
        <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Dev-branch login — test environment only</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full border rounded px-2 py-1 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
          autoFocus
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full border rounded px-2 py-1 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-800 dark:bg-slate-700 text-white rounded px-2 py-1 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
