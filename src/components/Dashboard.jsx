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

// Prevent duplicate key initialization for the same user
const keyInitialization = new Map();

function Dashboard({ user, onLogout }) {
  const [keyStatus, setKeyStatus] = useState(
    'Checking encryption keys...'
  );

  useEffect(() => {
    initializeUserKeys();

    // We intentionally don't cancel the initialization here.
    // If React runs the effect again in development mode,
    // the same promise will be reused.
  }, [user.id]);

  async function initializeUserKeys() {
    try {
      // If initialization for this user is already running,
      // wait for the existing operation instead of starting another.
      if (keyInitialization.has(user.id)) {
        const status = await keyInitialization.get(user.id);
        setKeyStatus(status);
        return;
      }

      const initializationPromise = performKeyInitialization(user.id);

      keyInitialization.set(user.id, initializationPromise);

      const status = await initializationPromise;

      setKeyStatus(status);
    } catch (error) {
      console.error('Key initialization error:', error);
      setKeyStatus(`Key initialization error: ${error.message}`);
    }
  }

    async function performKeyInitialization(userId) {
    // 1. Check local IndexedDB first
    const existingPrivateKey = await getPrivateKey(userId);

    if (existingPrivateKey) {
      return 'Encryption keys ready.';
    }

    // 2. Check Supabase for existing public key
    const { data: existingKey, error: fetchError } =
      await supabase
        .from('user_keys')
        .select('public_key')
        .eq('user_id', userId)
        .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    // 3. Public key already exists, but private key is missing locally
    if (existingKey) {
      return 'Private key is missing on this device. Existing encrypted data may require key recovery.';
    }

    // 4. Neither key exists → generate a new RSA pair
    const keyPair = await generateRSAKeyPair();

    // Export ONLY the public key
    const publicKey = await exportPublicKey(
      keyPair.publicKey
    );

    // 5. Insert public key into Supabase
    const { error: insertError } = await supabase
      .from('user_keys')
      .insert({
        user_id: userId,
        public_key: publicKey,
      });

    if (insertError) {
      throw insertError;
    }

    // 6. Store private key locally ONLY
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

  return (
    <div>
      <h2>Dashboard</h2>

      <p>Welcome, {user.email}</p>

      <p>{keyStatus}</p>
      <FileUpload user={user} />
      <DownloadFiles user={user} />

      <button onClick={onLogout}>Logout</button>
    </div>
  );
}

export default Dashboard;