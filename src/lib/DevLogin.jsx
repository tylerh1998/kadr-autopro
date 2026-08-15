import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const DEV_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true';

export default function DevLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!DEV_LOGIN_ENABLED) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  if (!DEV_LOGIN_ENABLED) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    navigate('/', { replace: true });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-950">
      <form onSubmit={handleSubmit} className="w-80 space-y-3 bg-white dark:bg-slate-900 p-6 rounded shadow border border-amber-400 dark:border-amber-600">
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
