import crypto from 'crypto';
import { authConfig } from '../config/index.js';

const PREFIX = 'enc:v1';

function getKey() {
  if (!authConfig.credentialEncryptionKey) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY is required to use device credentials');
  }
  return crypto.createHash('sha256').update(authConfig.credentialEncryptionKey).digest();
}

export function isEncryptedSecret(value) {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

export function encryptSecret(value) {
  if (!value || isEncryptedSecret(value)) {
    return value || '';
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decryptSecret(value) {
  if (!value || !isEncryptedSecret(value)) {
    return value || '';
  }

  const parts = value.split(':');
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted secret format');
  }

  const [, , ivValue, tagValue, encryptedValue] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getKey(),
    Buffer.from(ivValue, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}