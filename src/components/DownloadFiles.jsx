import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  getPrivateKey,
  decryptAESKey,
  decryptFile,
  importPublicKey,
  verifyRSAKeyPair,
} from '../lib/crypto';

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);

  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}

function DownloadFiles({ user }) {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadFiles();
  }, [user.id]);

  async function loadFiles() {
    try {
      setStatus('Loading encrypted files...');

      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', user.id)
        .order('uploaded_at', {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      setFiles(data || []);
      setStatus('');
    } catch (error) {
      console.error('Loading files error:', error);
      setStatus(`Failed to load files: ${error.message}`);
    }
  }

  async function handleDownload(fileRecord) {
    try {
      setStatus(`Downloading ${fileRecord.file_name}...`);

      // 1. Get user's private RSA key from IndexedDB
      const privateKey = await getPrivateKey(user.id);

      if (!privateKey) {
        throw new Error(
          'Private key not found on this device.'
        );
      }
      // Verify that the local private key matches
// the public key stored in Supabase.
const { data: keyRecord, error: keyError } =
  await supabase
    .from('user_keys')
    .select('public_key')
    .eq('user_id', user.id)
    .single();

if (keyError) {
  throw keyError;
}

const publicKey = await importPublicKey(
  keyRecord.public_key
);

const keysMatch = await verifyRSAKeyPair(
  publicKey,
  privateKey
);

if (!keysMatch) {
  throw new Error(
    'RSA public and private keys do not match.'
  );
}

      // 2. Download encrypted file from Supabase Storage
      const { data: encryptedBlob, error: downloadError } =
        await supabase.storage
          .from('encrypted-files')
          .download(fileRecord.storage_path);

      if (downloadError) {
        throw downloadError;
      }

      // 3. Convert encrypted file Blob to ArrayBuffer
      const encryptedData =
        await encryptedBlob.arrayBuffer();

      // 4. Recover encrypted AES key from Base64
      const encryptedAESKey = base64ToArrayBuffer(
        fileRecord.encrypted_aes_key
      );

      // 5. RSA-OAEP decrypt → recover AES key
      setStatus('Recovering AES encryption key...');

      const aesKey = await decryptAESKey(
        encryptedAESKey,
        privateKey
      );

      // 6. Recover IV
      const iv = new Uint8Array(
        base64ToArrayBuffer(fileRecord.iv)
      );

      // 7. AES-256-GCM decrypt the file
      setStatus('Decrypting file locally...');

      const decryptedData = await decryptFile(
        encryptedData,
        aesKey,
        iv
      );

      // 8. Create downloadable Blob
      const originalBlob = new Blob(
        [decryptedData],
        {
          type: 'application/octet-stream',
        }
      );

      // 9. Trigger browser download
      const downloadUrl =
        URL.createObjectURL(originalBlob);

      const link = document.createElement('a');

      link.href = downloadUrl;
      link.download = fileRecord.file_name;

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(downloadUrl);

      setStatus(
        `${fileRecord.file_name} decrypted and downloaded successfully!`
      );
    } catch (error) {
      console.error('Download/decryption error:', error);

      setStatus(
        `Download failed: ${error.message}`
      );
    }
  }

  return (
    <div>
      <h2>Your Encrypted Files</h2>

      {files.length === 0 ? (
        <p>No encrypted files found.</p>
      ) : (
        <div>
          {files.map((file) => (
            <div key={file.id}>
              <p>
                <strong>{file.file_name}</strong>
              </p>

              <p>
                Size: {file.file_size} bytes
              </p>

              <button
                onClick={() => handleDownload(file)}
              >
                Download & Decrypt
              </button>

              <hr />
            </div>
          ))}
        </div>
      )}

      {status && <p>{status}</p>}
    </div>
  );
}

export default DownloadFiles;