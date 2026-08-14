import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

const HushPrefix = 'hush:v1:';
const HushAlgorithm = 'pbkdf2-sha256+a256gcm+hmac-sha256';
const HushIterations = 210000;
type ByteArray = Uint8Array<ArrayBuffer>;

interface HushEnvelopeV1 {
  v: 1;
  alg: string;
  i: number;
  s: string;
  wi: string;
  w: string;
  ci: string;
  c: string;
  h: string;
}

interface DerivedKeys {
  kekRaw: ByteArray;
  hmacRaw: ByteArray;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function hasSubtleCrypto(): boolean {
  return Boolean(globalThis.crypto?.subtle);
}

function getRandomCrypto(): Crypto {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('WebCryptoUnavailable');
  }
  return globalThis.crypto;
}

function toByteArray(bytes: Uint8Array): ByteArray {
  const output: ByteArray = new Uint8Array(bytes.length);
  output.set(bytes);
  return output;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

function concatBytes(parts: ByteArray[]): ByteArray {
  const totalLength = parts.reduce((sum, item) => sum + item.length, 0);
  const result: ByteArray = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function encodeBase64(bytes: ByteArray): string {
  if (typeof btoa === 'function') {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function decodeBase64(value: string): ByteArray {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const output: ByteArray = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      output[i] = binary.charCodeAt(i);
    }
    return output;
  }
  const source = Buffer.from(value, 'base64');
  const output: ByteArray = new Uint8Array(source.length);
  output.set(source);
  return output;
}

function encodeBase64Url(bytes: ByteArray): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): ByteArray {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return decodeBase64(`${normalized}${padding}`);
}

function scopedPassphrase(passphrase: string, context: string): string {
  return `${context}::${passphrase}`;
}

async function deriveKeys(passphrase: string, context: string, salt: ByteArray, iterations: number): Promise<DerivedKeys> {
  const password = encoder.encode(scopedPassphrase(passphrase, context));
  let masterKeyRaw: ByteArray;

  if (hasSubtleCrypto()) {
    const crypto = getRandomCrypto();
    const material = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
    masterKeyRaw = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt,
          iterations,
        },
        material,
        256
      )
    );
  } else {
    masterKeyRaw = toByteArray(await pbkdf2Async(sha256, password, salt, { c: iterations, dkLen: 32 }));
  }

  const hkdfSalt: ByteArray = new Uint8Array(0);
  let kekRaw: ByteArray;
  let hmacRaw: ByteArray;

  if (hasSubtleCrypto()) {
    const crypto = getRandomCrypto();
    const hkdfMaterial = await crypto.subtle.importKey('raw', masterKeyRaw, 'HKDF', false, ['deriveBits']);
    kekRaw = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: hkdfSalt,
          info: encoder.encode('hush-wrap-v1'),
        },
        hkdfMaterial,
        256
      )
    );
    hmacRaw = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: hkdfSalt,
          info: encoder.encode('hush-mac-v1'),
        },
        hkdfMaterial,
        256
      )
    );
  } else {
    kekRaw = toByteArray(hkdf(sha256, masterKeyRaw, hkdfSalt, encoder.encode('hush-wrap-v1'), 32));
    hmacRaw = toByteArray(hkdf(sha256, masterKeyRaw, hkdfSalt, encoder.encode('hush-mac-v1'), 32));
  }

  return { kekRaw, hmacRaw };
}

async function aesGcmEncrypt(key: ByteArray, iv: ByteArray, data: ByteArray): Promise<ByteArray> {
  if (hasSubtleCrypto()) {
    const crypto = getRandomCrypto();
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data));
  }
  return toByteArray(gcm(key, iv).encrypt(data));
}

async function aesGcmDecrypt(key: ByteArray, iv: ByteArray, data: ByteArray): Promise<ByteArray> {
  if (hasSubtleCrypto()) {
    const crypto = getRandomCrypto();
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data));
  }
  return toByteArray(gcm(key, iv).decrypt(data));
}

async function hmacSign(key: ByteArray, data: ByteArray): Promise<ByteArray> {
  if (hasSubtleCrypto()) {
    const crypto = getRandomCrypto();
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign({ name: 'HMAC' }, cryptoKey, data));
  }
  return toByteArray(hmac(sha256, key, data));
}

async function hmacVerify(key: ByteArray, data: ByteArray, mac: ByteArray): Promise<boolean> {
  if (hasSubtleCrypto()) {
    const crypto = getRandomCrypto();
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'HMAC' }, cryptoKey, mac, data);
  }
  return timingSafeEqual(hmac(sha256, key, data), mac);
}

function parseEnvelope(payload: string): HushEnvelopeV1 {
  if (!payload.startsWith(HushPrefix)) {
    throw new Error('NotEncrypted');
  }
  const compact = payload.slice(HushPrefix.length);
  const parsed = JSON.parse(decoder.decode(decodeBase64Url(compact))) as HushEnvelopeV1;
  if (parsed.v !== 1 || parsed.alg !== HushAlgorithm) {
    throw new Error('UnsupportedEnvelope');
  }
  return parsed;
}

export function isHushEncryptedMessage(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.startsWith(HushPrefix);
}

export function generateStrongKey(): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  const cryptoObj = getRandomCrypto();
  const bytes = new Uint8Array(64);
  cryptoObj.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

export async function encryptHushMessage(plaintext: string, passphrase: string, context: string): Promise<string> {
  if (!passphrase.trim()) {
    throw new Error('PassphraseRequired');
  }
  const crypto = getRandomCrypto();
  const salt: ByteArray = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv: ByteArray = crypto.getRandomValues(new Uint8Array(12));
  const contentIv: ByteArray = crypto.getRandomValues(new Uint8Array(12));
  const dekRaw: ByteArray = crypto.getRandomValues(new Uint8Array(32));
  const { kekRaw, hmacRaw } = await deriveKeys(passphrase, context, salt, HushIterations);
  const wrappedDek = await aesGcmEncrypt(kekRaw, wrapIv, dekRaw);
  const ciphertext = await aesGcmEncrypt(dekRaw, contentIv, encoder.encode(plaintext));
  const macPayload = concatBytes([
    new Uint8Array([1]),
    salt,
    wrapIv,
    wrappedDek,
    contentIv,
    ciphertext,
    encoder.encode(context),
  ]);
  const mac = await hmacSign(hmacRaw, macPayload);
  const envelope: HushEnvelopeV1 = {
    v: 1,
    alg: HushAlgorithm,
    i: HushIterations,
    s: encodeBase64Url(salt),
    wi: encodeBase64Url(wrapIv),
    w: encodeBase64Url(wrappedDek),
    ci: encodeBase64Url(contentIv),
    c: encodeBase64Url(ciphertext),
    h: encodeBase64Url(mac),
  };
  return `${HushPrefix}${encodeBase64Url(encoder.encode(JSON.stringify(envelope)))}`;
}

export async function decryptHushMessage(payload: string, passphrase: string, context: string): Promise<string> {
  const envelope = parseEnvelope(payload);
  const salt = decodeBase64Url(envelope.s);
  const wrapIv = decodeBase64Url(envelope.wi);
  const wrappedDek = decodeBase64Url(envelope.w);
  const contentIv = decodeBase64Url(envelope.ci);
  const ciphertext = decodeBase64Url(envelope.c);
  const mac = decodeBase64Url(envelope.h);
  const { kekRaw, hmacRaw } = await deriveKeys(passphrase, context, salt, envelope.i);
  const macPayload = concatBytes([
    new Uint8Array([1]),
    salt,
    wrapIv,
    wrappedDek,
    contentIv,
    ciphertext,
    encoder.encode(context),
  ]);
  const macOk = await hmacVerify(hmacRaw, macPayload, mac);
  if (!macOk) {
    throw new Error('InvalidMac');
  }
  const dekRaw = await aesGcmDecrypt(kekRaw, wrapIv, wrappedDek);
  const plaintext = await aesGcmDecrypt(dekRaw, contentIv, ciphertext);
  return decoder.decode(plaintext);
}
