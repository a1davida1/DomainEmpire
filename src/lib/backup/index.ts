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
    revenueSnapshots, contentQueue, expenses, notifications, competitors,
    backlinkSnapshots } from '@/lib/db/schema';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

interface BackupResult {
    tables: Record<string, number>;
    totalRows: number;
    sizeBytes: number;
    sha256?: string;
    path?: string;
    timestamp: string;
}

/**
 * Export all tables to a JSON backup.
 * Returns the backup data and metadata including a SHA-256 checksum.
 */
export async function createBackup(outputDir?: string): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');

    const [
        domainsData, articlesData, keywordsData, monetizationData,
        researchData, revenueData, expensesData, notificationsData,
        competitorsData, backlinkData, queueData,
    ] = await Promise.all([
        db.select().from(domains),
        db.select().from(articles),
        db.select().from(keywords),
        db.select().from(monetizationProfiles),
        db.select().from(domainResearch),
        db.select().from(revenueSnapshots),
        db.select().from(expenses),
        db.select().from(notifications),
        db.select().from(competitors),
        db.select().from(backlinkSnapshots),
        db.select().from(contentQueue),
    ]);

    const tableCounts = {
        domains: domainsData.length,
        articles: articlesData.length,
        keywords: keywordsData.length,
        monetization_profiles: monetizationData.length,
        domain_research: researchData.length,
        revenue_snapshots: revenueData.length,
        expenses: expensesData.length,
        notifications: notificationsData.length,
        competitors: competitorsData.length,
        backlink_snapshots: backlinkData.length,
        content_queue: queueData.length,
    };

    const backup = {
        metadata: {
            version: '1.1',
            timestamp: new Date().toISOString(),
            tables: tableCounts,
        },
        data: {
            domains: domainsData,
            articles: articlesData,
            keywords: keywordsData,
            monetization_profiles: monetizationData,
            domain_research: researchData,
            revenue_snapshots: revenueData,
            expenses: expensesData,
            notifications: notificationsData,
            competitors: competitorsData,
            backlink_snapshots: backlinkData,
            content_queue: queueData,
        },
    };

    const jsonStr = JSON.stringify(backup);
    const sizeBytes = Buffer.byteLength(jsonStr, 'utf-8');
    const sha256 = createHash('sha256').update(jsonStr).digest('hex');
    const totalRows = Object.values(tableCounts).reduce((a, b) => a + b, 0);

    const result: BackupResult = {
        tables: tableCounts,
        totalRows,
        sizeBytes,
        sha256,
        timestamp: backup.metadata.timestamp,
    };

    if (outputDir) {
        await mkdir(outputDir, { recursive: true });
        const filePath = join(outputDir, `backup-${timestamp}.json`);
        await writeFile(filePath, jsonStr, 'utf-8');
        await writeFile(`${filePath}.sha256`, sha256, 'utf-8');
        result.path = filePath;
    }

    return result;
}

/**
 * Get backup as a JSON string (for API download).
 */
export async function getBackupData(): Promise<string> {
    const [
        domainsData, articlesData, keywordsData, monetizationData,
        researchData, revenueData, expensesData, notificationsData,
        competitorsData, backlinkData, queueData,
    ] = await Promise.all([
        db.select().from(domains),
        db.select().from(articles),
        db.select().from(keywords),
        db.select().from(monetizationProfiles),
        db.select().from(domainResearch),
        db.select().from(revenueSnapshots),
        db.select().from(expenses),
        db.select().from(notifications),
        db.select().from(competitors),
        db.select().from(backlinkSnapshots),
        db.select().from(contentQueue),
    ]);

    return JSON.stringify({
        version: '1.1',
        timestamp: new Date().toISOString(),
        domains: domainsData,
        articles: articlesData,
        keywords: keywordsData,
        monetization_profiles: monetizationData,
        domain_research: researchData,
        revenue_snapshots: revenueData,
        expenses: expensesData,
        notifications: notificationsData,
        competitors: competitorsData,
        backlink_snapshots: backlinkData,
        content_queue: queueData,
    });
}
