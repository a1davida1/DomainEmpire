/**
 * Database Backup Utility
 *
 * Exports critical database tables to JSON for backup purposes.
 * Can be triggered via API or run as a scheduled job.
 *
 * For full PostgreSQL backups, use pg_dump externally.
 * This module handles application-level logical backups.
 */

import { db } from '@/lib/db';
import { domains, articles, keywords, monetizationProfiles, domainResearch,
    revenueSnapshots, contentQueue, expenses, notifications } from '@/lib/db/schema';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

interface BackupResult {
    tables: Record<string, number>;
    totalRows: number;
    sizeBytes: number;
    path?: string;
    timestamp: string;
}

/**
 * Export all critical tables to a JSON backup.
 * Returns the backup data and metadata.
 */
export async function createBackup(outputDir?: string): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Fetch all tables in parallel
    const [
        domainsData,
        articlesData,
        keywordsData,
        monetizationData,
        researchData,
        revenueData,
        expensesData,
    ] = await Promise.all([
        db.select().from(domains),
        db.select().from(articles),
        db.select().from(keywords),
        db.select().from(monetizationProfiles),
        db.select().from(domainResearch),
        db.select().from(revenueSnapshots),
        db.select().from(expenses),
    ]);

    const backup = {
        metadata: {
            version: '1.0',
            timestamp: new Date().toISOString(),
            tables: {
                domains: domainsData.length,
                articles: articlesData.length,
                keywords: keywordsData.length,
                monetization_profiles: monetizationData.length,
                domain_research: researchData.length,
                revenue_snapshots: revenueData.length,
                expenses: expensesData.length,
            },
        },
        data: {
            domains: domainsData,
            articles: articlesData,
            keywords: keywordsData,
            monetization_profiles: monetizationData,
            domain_research: researchData,
            revenue_snapshots: revenueData,
            expenses: expensesData,
        },
    };

    const jsonStr = JSON.stringify(backup, null, 2);
    const sizeBytes = Buffer.byteLength(jsonStr, 'utf-8');

    const totalRows = Object.values(backup.metadata.tables).reduce((a, b) => a + b, 0);

    const result: BackupResult = {
        tables: backup.metadata.tables,
        totalRows,
        sizeBytes,
        timestamp: backup.metadata.timestamp,
    };

    // Write to disk if output directory specified
    if (outputDir) {
        await mkdir(outputDir, { recursive: true });
        const filePath = join(outputDir, `backup-${timestamp}.json`);
        await writeFile(filePath, jsonStr, 'utf-8');
        result.path = filePath;
    }

    return result;
}

/**
 * Get backup as a JSON string (for API download).
 */
export async function getBackupData(): Promise<string> {
    const [
        domainsData,
        articlesData,
        keywordsData,
        monetizationData,
        researchData,
        revenueData,
        expensesData,
    ] = await Promise.all([
        db.select().from(domains),
        db.select().from(articles),
        db.select().from(keywords),
        db.select().from(monetizationProfiles),
        db.select().from(domainResearch),
        db.select().from(revenueSnapshots),
        db.select().from(expenses),
    ]);

    return JSON.stringify({
        version: '1.0',
        timestamp: new Date().toISOString(),
        domains: domainsData,
        articles: articlesData,
        keywords: keywordsData,
        monetization_profiles: monetizationData,
        domain_research: researchData,
        revenue_snapshots: revenueData,
        expenses: expensesData,
    });
}
