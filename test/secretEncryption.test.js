import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../src/utils/secretEncryption.js';

test('encrypts and decrypts device credentials', () => {
  const encrypted = encryptSecret('camera-password');

  assert.equal(isEncryptedSecret(encrypted), true);
  assert.notEqual(encrypted, 'camera-password');
  assert.equal(decryptSecret(encrypted), 'camera-password');
});

test('does not encrypt an encrypted value twice', () => {
  const encrypted = encryptSecret('camera-password');

  assert.equal(encryptSecret(encrypted), encrypted);
});

test('supports empty values and plaintext migration reads', () => {
  assert.equal(encryptSecret(''), '');
  assert.equal(decryptSecret(''), '');
  assert.equal(decryptSecret('legacy-plaintext'), 'legacy-plaintext');
});

test('rejects tampered ciphertext', () => {
  const encrypted = encryptSecret('camera-password');
  const parts = encrypted.split(':');
  parts[4] = `${parts[4][0] === 'A' ? 'B' : 'A'}${parts[4].slice(1)}`;

  assert.throws(() => decryptSecret(parts.join(':')));
});