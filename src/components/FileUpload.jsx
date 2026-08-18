import { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  encryptFile,
  encryptAESKey,
  importPublicKey,
} from '../lib/crypto';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);

  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function FileUpload({ user }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState('');

  function handleFileChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    setSelectedFile(file);
    setStatus('');
  }

  async function handleUpload() {
    if (!selectedFile) {
      setStatus('Please select a file first.');
      return;
    }

    try {
      setStatus('Preparing secure upload...');

      // 1. Get user's public RSA key
      const { data: keyRecord, error: keyError } = await supabase
        .from('user_keys')
        .select('public_key')
        .eq('user_id', user.id)
        .single();

      if (keyError) {
        throw keyError;
      }

      // 2. Convert stored public key into CryptoKey
      const publicKey = await importPublicKey(
        keyRecord.public_key
      );

      setStatus('Encrypting file locally...');

      // 3. Encrypt file using AES-256-GCM
      const {
        encryptedData,
        aesKey,
        iv,
      } = await encryptFile(selectedFile);

      setStatus('Encrypting AES session key...');

      // 4. Protect AES session key using RSA-OAEP
      const encryptedAESKey = await encryptAESKey(
        aesKey,
        publicKey
      );

      // 5. Generate a unique file ID
      const fileId = crypto.randomUUID();

      // 6. Store encrypted file inside user's own folder
      const storagePath =
        `${user.id}/${fileId}.enc`;

      setStatus('Uploading encrypted file...');

      // 7. Convert encrypted ArrayBuffer to Blob
      const encryptedBlob = new Blob(
        [encryptedData],
        {
          type: 'application/octet-stream',
        }
      );

      // 8. Upload ONLY encrypted data
      const { error: uploadError } = await supabase.storage
        .from('encrypted-files')
        .upload(storagePath, encryptedBlob, {
          contentType: 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      setStatus('Saving encrypted file metadata...');

      // 9. Store encrypted AES key + IV + metadata
      const { error: metadataError } = await supabase
        .from('files')
        .insert({
          user_id: user.id,
          file_name: selectedFile.name,
          file_size: selectedFile.size,
          storage_path: storagePath,
          encrypted_aes_key:
            arrayBufferToBase64(encryptedAESKey),
          iv: arrayBufferToBase64(iv),
        });

      // If metadata insertion fails, remove the uploaded object
      // so we don't leave an orphaned encrypted file.
      if (metadataError) {
        await supabase.storage
          .from('encrypted-files')
          .remove([storagePath]);

        throw metadataError;
      }

      setStatus(
        'File encrypted and uploaded securely!'
      );

      setSelectedFile(null);
    } catch (error) {
      console.error('Secure upload error:', error);

      setStatus(
        `Upload failed: ${error.message}`
      );
    }
  }

  return (
    <div>
      <h2>Secure File Upload</h2>

      <input
        type="file"
        onChange={handleFileChange}
      />

      {selectedFile && (
        <p>
          Selected file: {selectedFile.name}
        </p>
      )}

      <button
        onClick={handleUpload}
        disabled={!selectedFile}
      >
        Upload Securely
      </button>

      {status && <p>{status}</p>}
    </div>
  );
}

export default FileUpload;