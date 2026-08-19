import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  generateRSAKeyPair,
  exportPublicKey,
  savePrivateKey,
  getPrivateKey,
} from '../lib/crypto';
import FileUpload from './FileUpload';
import DownloadFiles from './DownloadFiles';

const keyInitialization = new Map();

function Dashboard({ user, onLogout }) {
  const [keyStatus, setKeyStatus] = useState(
    'Checking encryption keys...'
  );

  useEffect(() => {
    initializeUserKeys();
  }, [user.id]);

  async function initializeUserKeys() {
    try {
      if (keyInitialization.has(user.id)) {
        const status = await keyInitialization.get(user.id);
        setKeyStatus(status);
        return;
      }

      const initializationPromise =
        performKeyInitialization(user.id);

      keyInitialization.set(
        user.id,
        initializationPromise
      );

      const status = await initializationPromise;

      setKeyStatus(status);
    } catch (error) {
      console.error('Key initialization error:', error);
      setKeyStatus(
        `Key initialization error: ${error.message}`
      );
    }
  }

  async function performKeyInitialization(userId) {
    const existingPrivateKey =
      await getPrivateKey(userId);

    if (existingPrivateKey) {
      return 'Encryption keys ready.';
    }

    const {
      data: existingKey,
      error: fetchError,
    } = await supabase
      .from('user_keys')
      .select('public_key')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (existingKey) {
      return 'Private key is missing on this device. Existing encrypted data may require key recovery.';
    }

    const keyPair = await generateRSAKeyPair();

    const publicKey = await exportPublicKey(
      keyPair.publicKey
    );

    const { error: insertError } = await supabase
      .from('user_keys')
      .insert({
        user_id: userId,
        public_key: publicKey,
      });

    if (insertError) {
      throw insertError;
    }

    await savePrivateKey(
      userId,
      keyPair.privateKey
    );

    return 'Encryption keys generated successfully.';
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout error:', error.message);
    }
  }

  const encryptionReady =
    keyStatus === 'Encryption keys ready.' ||
    keyStatus ===
      'Encryption keys generated successfully.';

  return (
    <div className="dashboard-page">

      {/* Background */}
      <div className="dashboard-background">
        <div className="dashboard-glow dashboard-glow-one"></div>
        <div className="dashboard-glow dashboard-glow-two"></div>
      </div>

      {/* Navbar */}
      <header className="dashboard-navbar">
        <div className="dashboard-brand">
          <div className="dashboard-brand-icon">
            🔐
          </div>

          <div>
            <div className="dashboard-brand-name">
              HybridVault
            </div>

            <div className="dashboard-brand-subtitle">
              Secure Cloud Storage
            </div>
          </div>
        </div>

        <div className="dashboard-user-area">
          <div className="dashboard-user">
            <div className="dashboard-avatar">
              {user.email?.charAt(0).toUpperCase()}
            </div>

            <div className="dashboard-user-info">
              <span className="dashboard-user-label">
                Signed in as
              </span>

              <span className="dashboard-user-email">
                {user.email}
              </span>
            </div>
          </div>

          <button
            className="logout-button"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="dashboard-main">

        {/* Hero */}
        <section className="dashboard-hero">
          <div>
            <div className="security-badge">
              <span className="security-dot"></span>
              End-to-end protection enabled
            </div>

            <h1>
              Your files.
              <br />
              <span>Protected by design.</span>
            </h1>

            <p>
              Files are encrypted in your browser before
              they are uploaded to the cloud.
            </p>
          </div>

          <div className="security-card">
            <div className="security-card-icon">
              🔒
            </div>

            <div>
              <strong>
                Client-side encryption
              </strong>

              <span>
                {encryptionReady
                  ? 'Encryption keys are ready'
                  : keyStatus}
              </span>
            </div>
          </div>
        </section>

        {/* Upload */}
        <section className="dashboard-section">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">
                SECURE TRANSFER
              </span>

              <h2>Upload a file</h2>

              <p>
                Your file is encrypted locally before
                leaving this device.
              </p>
            </div>
          </div>

          <FileUpload user={user} />
        </section>

        {/* Files */}
        <section className="dashboard-section files-section">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">
                YOUR STORAGE
              </span>

              <h2>Encrypted files</h2>

              <p>
                Only encrypted data is stored in the
                cloud.
              </p>
            </div>
          </div>

          <DownloadFiles user={user} />
        </section>

        {/* Security footer */}
        <section className="security-footer">
          <div className="security-footer-icon">
            🔐
          </div>

          <div>
            <strong>
              Your privacy comes first
            </strong>

            <p>
              AES-256-GCM protects your files while
              RSA-OAEP protects the encryption keys.
            </p>
          </div>
        </section>

      </main>
    </div>
  );
}

export default Dashboard;