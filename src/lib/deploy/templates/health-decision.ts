/**
 * Health decision page template generator.
 * Renders health-related informational content with a prominent
 * medical disclaimer and a "Talk to Your Doctor" CTA.
 * Uses Article schema (not MedicalWebPage) since content is AI-generated.
 */

import type { Article } from '@/lib/db/schema';
import {
  escapeHtml,
  renderMarkdownToHtml,
  buildTrustElements,
  buildSchemaJsonLd,
  wrapInHtmlPage,
  generateDataSourcesSection,
  buildOpenGraphTags,
  buildFreshnessBadge,
  type DisclosureInfo,
  type ArticleDatasetInfo,
} from './shared';

const MEDICAL_DISCLAIMER =
  'This content is for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider.';

function buildMedicalDisclaimerHtml(): string {
  return `<div class="medical-disclaimer" role="alert">
  <strong>Medical Disclaimer:</strong> ${escapeHtml(MEDICAL_DISCLAIMER)}
</div>`;
}

function buildDoctorCtaHtml(): string {
  return `<div class="cta-doctor">
  <h2>Talk to Your Doctor</h2>
  <p>The information on this page is not a substitute for professional medical guidance. Please consult a qualified healthcare provider before making any health-related decisions.</p>
</div>`;
}

export async function generateHealthDecisionPage(
  article: Article,
  domain: string,
  disclosure: DisclosureInfo | null | undefined,
  datasets: ArticleDatasetInfo[],
  pageShell: import('./shared').PageShell,
): Promise<string> {
  const contentHtml = await renderMarkdownToHtml(article.contentMarkdown || '');
  const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
  const dataSourcesHtml = generateDataSourcesSection(datasets);
  const schemaLd = buildSchemaJsonLd(article, domain, 'Article');

  const medicalDisclaimerHtml = buildMedicalDisclaimerHtml();
  const doctorCtaHtml = buildDoctorCtaHtml();
  const titleHtml = escapeHtml(article.title);
  const freshnessBadge = buildFreshnessBadge(article, datasets);
  const ogTags = buildOpenGraphTags(article, domain);

  const body = `${disclaimerHtml}
  ${schemaLd}
  ${medicalDisclaimerHtml}
  ${freshnessBadge}
  <article>
    <h1>${titleHtml}</h1>
    ${contentHtml}
    ${doctorCtaHtml}
  </article>
  ${dataSourcesHtml}
  ${trustHtml}`;

  return wrapInHtmlPage(article.title, article.metaDescription || '', body, pageShell, ogTags);
}
