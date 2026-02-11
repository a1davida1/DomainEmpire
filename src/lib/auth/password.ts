/**
 * Password hashing using Node.js built-in scrypt.
 * No external dependencies needed.
 */

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

/**
 * Hash a password with a random salt.
 * Returns format: salt:hash (both hex-encoded)
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH).toString('hex');
    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    return `${salt}:${derived.toString('hex')}`;
}

/**
 * Verify a password against a stored hash.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;

    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    const hashBuffer = Buffer.from(hash, 'hex');

    if (derived.length !== hashBuffer.length) return false;
    return timingSafeEqual(derived, hashBuffer);
}
