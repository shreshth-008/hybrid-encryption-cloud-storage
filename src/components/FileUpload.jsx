import { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  encryptFile,
  encryptAESKey,
  importPublicKey,
} from '../lib/crypto';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

function sanitizeFileName(fileName) {
  return fileName
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/]/g, '_')
    .trim()
    .slice(0, 255) || 'encrypted-file';
}

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

    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setStatus('File is too large. Maximum size is 100 MB.');
      event.target.value = '';
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

    if (selectedFile.size > MAX_FILE_SIZE) {
      setStatus('File is too large. Maximum size is 100 MB.');
      return;
    }

    try {
      setStatus('Preparing secure upload...');

      const { data: keyRecord, error: keyError } =
        await supabase
          .from('user_keys')
          .select('public_key')
          .eq('user_id', user.id)
          .single();

      if (keyError) {
        throw keyError;
      }

      if (!keyRecord?.public_key) {
        throw new Error('Public encryption key is unavailable.');
      }

      const publicKey = await importPublicKey(
        keyRecord.public_key
      );

      setStatus('Encrypting file locally...');

      const {
        encryptedData,
        aesKey,
        iv,
      } = await encryptFile(selectedFile);

      setStatus('Encrypting AES session key...');

      const encryptedAESKey = await encryptAESKey(
        aesKey,
        publicKey
      );

      const fileId = crypto.randomUUID();

      const storagePath =
        `${user.id}/${fileId}.enc`;

      const safeFileName =
        sanitizeFileName(selectedFile.name);

      setStatus('Uploading encrypted file...');

      const encryptedBlob = new Blob(
        [encryptedData],
        {
          type: 'application/octet-stream',
        }
      );

      const { error: uploadError } =
        await supabase.storage
          .from('encrypted-files')
          .upload(
            storagePath,
            encryptedBlob,
            {
              contentType:
                'application/octet-stream',
              upsert: false,
            }
          );

      if (uploadError) {
        throw uploadError;
      }

      setStatus(
        'Saving encrypted file metadata...'
      );

      const { error: metadataError } =
        await supabase
          .from('files')
          .insert({
            user_id: user.id,
            file_name: safeFileName,
            file_size: selectedFile.size,
            storage_path: storagePath,
            encrypted_aes_key:
              arrayBufferToBase64(
                encryptedAESKey
              ),
            iv: arrayBufferToBase64(iv),
          });

      if (metadataError) {
        try {
          await supabase.storage
            .from('encrypted-files')
            .remove([storagePath]);
        } catch (cleanupError) {
          console.error(
            'Encrypted file cleanup failed:',
            cleanupError
          );
        }

        throw metadataError;
      }

      setStatus(
        'File encrypted and uploaded securely!'
      );

      setSelectedFile(null);
    } catch (error) {
      console.error(
        'Secure upload error:',
        error
      );

      setStatus(
        'Upload failed. Please try again.'
      );
    }
  }

  return (
    <div className="upload-card">

      <div className="upload-icon">
        🔐
      </div>

      <div className="upload-content">
        <h3>Secure File Upload</h3>

        <p>
          Choose a file to encrypt and securely
          store it in your private cloud.
        </p>

        <label className="file-drop-zone">
          <input
            type="file"
            onChange={handleFileChange}
          />

          <div className="upload-cloud-icon">
            ↑
          </div>

          <strong>
            {selectedFile
              ? selectedFile.name
              : 'Choose a file to encrypt'}
          </strong>

          <span>
            Your file is encrypted before upload
          </span>

          <div className="browse-button">
            Browse files
          </div>
        </label>

        {selectedFile && (
          <div className="selected-file">
            <div className="selected-file-icon">
              📄
            </div>

            <div className="selected-file-info">
              <strong>
                {selectedFile.name}
              </strong>

              <span>
                {(
                  selectedFile.size / 1024
                ).toFixed(1)} KB
              </span>
            </div>

            <span className="selected-file-status">
              Ready
            </span>
          </div>
        )}

        <button
          className="secure-upload-button"
          onClick={handleUpload}
          disabled={!selectedFile}
        >
          <span>🔒</span>
          Upload securely
        </button>

        {status && (
          <div
            className={`upload-status ${
              status.includes('failed') ||
              status.includes('Please') ||
              status.includes('too large')
                ? 'upload-status-error'
                : ''
            }`}
          >
            <span>•</span>
            {status}
          </div>
        )}
      </div>

      <div className="upload-security-note">
        <span>🔒</span>
        <span>
          AES-256-GCM encryption •
          Client-side processing
        </span>
      </div>
    </div>
  );
}

export default FileUpload;