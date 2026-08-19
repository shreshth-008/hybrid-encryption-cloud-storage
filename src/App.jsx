import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Dashboard from './components/Dashboard';
import Login from './components/login';
import Register from './components/register';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    getCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function getCurrentUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    setUser(session?.user ?? null);
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Securing your session...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-background">
          <div className="auth-glow auth-glow-one"></div>
          <div className="auth-glow auth-glow-two"></div>
        </div>

        <div className="auth-brand">
          <div className="brand-icon">🔐</div>
          <span>HybridVault</span>
        </div>

        <div className="auth-card">
          {showRegister ? (
            <Register />
          ) : (
            <Login />
          )}

          <div className="auth-switch">
            {showRegister ? (
              <>
                <span>Already have an account?</span>
                <button
                  type="button"
                  onClick={() => setShowRegister(false)}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                <span>Don't have an account?</span>
                <button
                  type="button"
                  onClick={() => setShowRegister(true)}
                >
                  Create account
                </button>
              </>
            )}
          </div>
        </div>

        <div className="auth-footer">
          <span>🔒 Client-side encrypted storage</span>
          <span>•</span>
          <span>Your files stay protected</span>
        </div>
      </div>
    );
  }

  return (
    <Dashboard
      user={user}
      onLogout={handleLogout}
    />
  );
}

export default App;