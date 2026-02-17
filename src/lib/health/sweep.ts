/**
 * Domain health sweep — recalculates composite health scores for all active domains.
 * Designed to run from the worker's hourly loop.
 * Also checks SSL certificate expiry and DNS resolution.
 */

import { db, domains } from '@/lib/db';
import { and, isNull, or, lte, sql } from 'drizzle-orm';
import { calculateCompositeHealth } from './scoring';
import { createNotification } from '@/lib/notifications';

const STALE_HEALTH_HOURS = 6; // Re-score domains whose health is older than 6 hours
const SSL_WARNING_DAYS = 14;
const SSL_CRITICAL_DAYS = 7;
const MAX_DOMAINS_PER_SWEEP = 50;

interface HealthSweepSummary {
    scanned: number;
    updated: number;
    sslWarnings: number;
    dnsFailures: number;
    errors: number;
}

/**
 * Check SSL certificate expiry for a domain.
 * Uses a TLS connection to read the cert's notAfter date.
 */
async function checkSslExpiry(domainName: string): Promise<{ daysRemaining: number | null; error?: string }> {
    try {
        // Use Node.js TLS to check certificate
        const tls = await import('node:tls');
        return new Promise((resolve) => {
            const socket = tls.connect(443, domainName, { servername: domainName, timeout: 10_000 }, () => {
                const cert = socket.getPeerCertificate();
                socket.destroy();
                if (cert && cert.valid_to) {
                    const expiryDate = new Date(cert.valid_to);
                    const daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                    resolve({ daysRemaining });
                } else {
                    resolve({ daysRemaining: null, error: 'No certificate found' });
                }
            });
            socket.on('error', (err) => {
                socket.destroy();
                resolve({ daysRemaining: null, error: err.message });
            });
            socket.setTimeout(10_000, () => {
                socket.destroy();
                resolve({ daysRemaining: null, error: 'Timeout' });
            });
        });
    } catch (err) {
        return { daysRemaining: null, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}

/**
 * Check DNS resolution for a domain.
 */
async function checkDnsResolution(domainName: string): Promise<{ resolved: boolean; error?: string }> {
    try {
        const dns = await import('node:dns/promises');
        await dns.resolve4(domainName);
        return { resolved: true };
    } catch (err) {
        return { resolved: false, error: err instanceof Error ? err.message : 'DNS resolution failed' };
    }
}

/**
 * Run the health sweep for all domains needing a refresh.
 */
export async function runDomainHealthSweep(): Promise<HealthSweepSummary> {
    const summary: HealthSweepSummary = {
        scanned: 0,
        updated: 0,
        sslWarnings: 0,
        dnsFailures: 0,
        errors: 0,
    };

    try {
        const staleThreshold = new Date(Date.now() - STALE_HEALTH_HOURS * 60 * 60 * 1000);

        // Get domains that need health recalculation
        const staleDomains = await db
            .select({ id: domains.id, domain: domains.domain, isDeployed: domains.isDeployed })
            .from(domains)
            .where(and(
                isNull(domains.deletedAt),
                or(
                    isNull(domains.healthUpdatedAt),
                    lte(domains.healthUpdatedAt, staleThreshold),
                ),
            ))
            .orderBy(sql`${domains.healthUpdatedAt} ASC NULLS FIRST`)
            .limit(MAX_DOMAINS_PER_SWEEP);

        summary.scanned = staleDomains.length;

        for (const domain of staleDomains) {
            try {
                // Recalculate composite health score
                await calculateCompositeHealth(domain.id);
                summary.updated++;

                // For deployed domains, also check SSL and DNS
                if (domain.isDeployed) {
                    // SSL check
                    const ssl = await checkSslExpiry(domain.domain);
                    if (ssl.daysRemaining !== null) {
                        if (ssl.daysRemaining <= SSL_CRITICAL_DAYS) {
                            await createNotification({
                                domainId: domain.id,
                                type: 'deploy_failed',
                                severity: 'critical',
                                title: `SSL certificate expiring in ${ssl.daysRemaining} days on ${domain.domain}`,
                                message: `The SSL certificate for ${domain.domain} expires in ${ssl.daysRemaining} days. Renew immediately.`,
                                actionUrl: `/dashboard/domains/${domain.id}`,
                            });
                            summary.sslWarnings++;
                        } else if (ssl.daysRemaining <= SSL_WARNING_DAYS) {
                            await createNotification({
                                domainId: domain.id,
                                type: 'deploy_failed',
                                severity: 'warning',
                                title: `SSL certificate expiring soon on ${domain.domain}`,
                                message: `The SSL certificate for ${domain.domain} expires in ${ssl.daysRemaining} days.`,
                                actionUrl: `/dashboard/domains/${domain.id}`,
                            });
                            summary.sslWarnings++;
                        }
                    }

                    // DNS check
                    const dns = await checkDnsResolution(domain.domain);
                    if (!dns.resolved) {
                        await createNotification({
                            domainId: domain.id,
                            type: 'deploy_failed',
                            severity: 'critical',
                            title: `DNS resolution failed for ${domain.domain}`,
                            message: `Cannot resolve ${domain.domain}: ${dns.error || 'unknown error'}`,
                            actionUrl: `/dashboard/domains/${domain.id}`,
                        });
                        summary.dnsFailures++;
                    }
                }
            } catch (err) {
                console.error(`[HealthSweep] Error processing ${domain.domain}:`, err);
                summary.errors++;
            }
        }
    } catch (err) {
        console.error('[HealthSweep] Sweep failed:', err);
        summary.errors++;
    }

    return summary;
}
