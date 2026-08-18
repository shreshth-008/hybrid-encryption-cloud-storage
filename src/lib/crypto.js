const DB_NAME = 'hybrid-encryption-db';
const STORE_NAME = 'private_keys';

function openKeyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function generateRSAKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  return keyPair;
}

export async function exportPublicKey(publicKey) {
  const exportedKey = await window.crypto.subtle.exportKey(
    'spki',
    publicKey
  );

  const bytes = new Uint8Array(exportedKey);

  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export async function savePrivateKey(userId, privateKey) {
  const db = await openKeyDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.put(privateKey, userId);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getPrivateKey(userId) {
  const db = await openKeyDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.get(userId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}
export async function encryptFile(file) {
  // Generate a random 256-bit AES key
  const aesKey = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );

  // Generate a random 96-bit IV
  const iv = window.crypto.getRandomValues(
    new Uint8Array(12)
  );

  // Read the original file
  const fileData = await file.arrayBuffer();

  // Encrypt the file using AES-256-GCM
  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    aesKey,
    fileData
  );

  return {
    encryptedData,
    aesKey,
    iv,
  };
}
export async function decryptFile(encryptedData, aesKey, iv) {
  const decryptedData = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    aesKey,
    encryptedData
  );

  return decryptedData;
}
export async function encryptAESKey(aesKey, publicKey) {
  const rawAESKey = await window.crypto.subtle.exportKey(
    'raw',
    aesKey
  );

  const encryptedAESKey = await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey,
    rawAESKey
  );

  return encryptedAESKey;
}
export async function decryptAESKey(
  encryptedAESKey,
  privateKey
) {
  const rawAESKey = await window.crypto.subtle.decrypt(
    {
      name: 'RSA-OAEP',
    },
    privateKey,
    encryptedAESKey
  );

  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    rawAESKey,
    {
      name: 'AES-GCM',
    },
    true,
    ['encrypt', 'decrypt']
  );

  return aesKey;
}
export async function importPublicKey(publicKeyBase64) {
  const binaryString = atob(publicKeyBase64);

  const keyBytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    keyBytes[i] = binaryString.charCodeAt(i);
  }

  const publicKey = await window.crypto.subtle.importKey(
    'spki',
    keyBytes.buffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  );

  return publicKey;
}
export async function verifyRSAKeyPair(publicKey, privateKey) {
  const testData = new TextEncoder().encode(
    'RSA key pair verification test'
  );

  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey,
    testData
  );

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'RSA-OAEP',
    },
    privateKey,
    encrypted
  );

  const decryptedText = new TextDecoder().decode(
    decrypted
  );

  return decryptedText === 'RSA key pair verification test';
}