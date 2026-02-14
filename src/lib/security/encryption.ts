import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENCRYPTION_VERSION = 'v1';
const AES_ALGORITHM = 'aes-256-gcm';
const IV_SIZE_BYTES = 12;

function resolveEncryptionSecret(): string {
    const explicit = process.env.GROWTH_CREDENTIALS_ENCRYPTION_KEY?.trim();
    if (explicit) {
        return explicit;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing required environment variable: GROWTH_CREDENTIALS_ENCRYPTION_KEY');
    }

    const devFallback = process.env.DATABASE_URL?.trim();
    if (devFallback) {
        return devFallback;
    }

    return 'domainempire-dev-only-encryption-key';
}

function deriveKey(): Buffer {
    const secret = resolveEncryptionSecret();
    return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
    if (plaintext.trim().length === 0) {
        throw new Error('Cannot encrypt an empty secret');
    }

    const iv = randomBytes(IV_SIZE_BYTES);
    const cipher = createCipheriv(AES_ALGORITHM, deriveKey(), iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
        ENCRYPTION_VERSION,
        iv.toString('base64url'),
        authTag.toString('base64url'),
        encrypted.toString('base64url'),
    ].join('.');
}

export function decryptSecret(ciphertext: string): string {
    const [version, ivEncoded, authTagEncoded, encryptedEncoded] = ciphertext.split('.');
    if (
        version !== ENCRYPTION_VERSION
        || !ivEncoded
        || !authTagEncoded
        || !encryptedEncoded
    ) {
        throw new Error('Invalid encrypted secret format');
    }

    const iv = Buffer.from(ivEncoded, 'base64url');
    const authTag = Buffer.from(authTagEncoded, 'base64url');
    const encrypted = Buffer.from(encryptedEncoded, 'base64url');

    const decipher = createDecipheriv(AES_ALGORITHM, deriveKey(), iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

