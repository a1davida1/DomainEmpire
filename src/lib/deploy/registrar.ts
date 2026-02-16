import { updateNameservers as updateGoDaddyNameservers } from '@/lib/deploy/godaddy';
import { hasNamecheapCredentials, updateNamecheapNameservers } from '@/lib/deploy/namecheap';

export const AUTOMATED_NAMESERVER_REGISTRARS = ['godaddy', 'namecheap'] as const;
export type AutomatedNameserverRegistrar = typeof AUTOMATED_NAMESERVER_REGISTRARS[number];

function normalizeRegistrar(value: string | null | undefined): string {
    return (value || '').trim().toLowerCase();
}

export function isAutomatedNameserverRegistrar(
    registrar: string | null | undefined,
): registrar is AutomatedNameserverRegistrar {
    return AUTOMATED_NAMESERVER_REGISTRARS.includes(
        normalizeRegistrar(registrar) as AutomatedNameserverRegistrar,
    );
}

export function hasRegistrarNameserverCredentials(registrar: string | null | undefined): boolean {
    const normalized = normalizeRegistrar(registrar);
    if (normalized === 'godaddy') {
        return Boolean(process.env.GODADDY_API_KEY?.trim() && process.env.GODADDY_API_SECRET?.trim());
    }
    if (normalized === 'namecheap') {
        return hasNamecheapCredentials();
    }
    return false;
}

export function registrarCredentialHint(registrar: string | null | undefined): string {
    const normalized = normalizeRegistrar(registrar);
    if (normalized === 'godaddy') {
        return 'GODADDY_API_KEY + GODADDY_API_SECRET';
    }
    if (normalized === 'namecheap') {
        return 'NAMECHEAP_API_USER + NAMECHEAP_API_KEY + NAMECHEAP_CLIENT_IP';
    }
    return 'unsupported registrar';
}

export async function updateRegistrarNameservers(
    registrar: string | null | undefined,
    domain: string,
    nameservers: string[],
): Promise<void> {
    const normalized = normalizeRegistrar(registrar);
    if (normalized === 'godaddy') {
        await updateGoDaddyNameservers(domain, nameservers);
        return;
    }
    if (normalized === 'namecheap') {
        await updateNamecheapNameservers(domain, nameservers);
        return;
    }
    throw new Error(`Automated nameserver cutover is not supported for registrar: ${registrar || 'unknown'}`);
}
