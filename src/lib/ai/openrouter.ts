/**
 * OpenRouter AI Client
 * 
 * Unified API gateway for multiple AI models (Grok, Claude, etc.)
 * Includes retry logic, cost tracking, and error handling.
 */
import { withCircuitBreaker } from '@/lib/tpilot/core/circuit-breaker';
import { withRetry } from '@/lib/tpilot/core/retry';

function envModel(key: string, fallback: string): string {
    const value = process.env[key];
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

const FAST_MODEL = envModel('OPENROUTER_MODEL_FAST', 'openrouter/auto');
const SEO_MODEL = envModel('OPENROUTER_MODEL_SEO', 'openrouter/auto');
const QUALITY_MODEL = envModel('OPENROUTER_MODEL_QUALITY', 'openrouter/auto');
const REVIEW_MODEL = envModel('OPENROUTER_MODEL_REVIEW', 'anthropic/claude-opus-4.1');
const RESEARCH_MODEL = envModel('OPENROUTER_MODEL_RESEARCH', 'openrouter/auto');
const EMERGENCY_FALLBACK_MODEL = envModel('OPENROUTER_MODEL_FALLBACK', 'openrouter/auto');

export const MODEL_CONFIG = {
    // Fast, low-latency operations
    keywordResearch: FAST_MODEL,
    domainClassify: FAST_MODEL,
    seoOptimize: SEO_MODEL,
    titleGeneration: FAST_MODEL,

    // High-quality drafts
    outlineGeneration: QUALITY_MODEL,
    draftGeneration: QUALITY_MODEL,
    humanization: QUALITY_MODEL,

    // Fallback for bulk operations
    bulkOperations: FAST_MODEL,
    voiceSeedGeneration: QUALITY_MODEL,

    // AI Review (Opus-class)
    aiReview: REVIEW_MODEL,

    // Deep Research (Online)
    research: RESEARCH_MODEL,

    // v2 Block content generation
    blockContent: QUALITY_MODEL,
} as const;

export type AIModelTask = keyof typeof MODEL_CONFIG;

type RoutingProfile = {
    fallbackTasks: AIModelTask[];
    promptVersion: string;
};

export const MODEL_ROUTING_VERSION = '2026-02-14.v1';

// Explicit task-to-model fallback chain and prompt-version governance.
const MODEL_ROUTING_REGISTRY: Record<AIModelTask, RoutingProfile> = {
    keywordResearch: { fallbackTasks: ['seoOptimize'], promptVersion: 'keyword.v1' },
    domainClassify: { fallbackTasks: ['seoOptimize'], promptVersion: 'domain-classify.v1' },
    titleGeneration: { fallbackTasks: ['seoOptimize'], promptVersion: 'title.v1' },
    seoOptimize: { fallbackTasks: ['humanization'], promptVersion: 'seo.v1' },
    outlineGeneration: { fallbackTasks: ['humanization', 'seoOptimize'], promptVersion: 'outline.v1' },
    draftGeneration: { fallbackTasks: ['humanization', 'seoOptimize'], promptVersion: 'draft.v1' },
    humanization: { fallbackTasks: ['draftGeneration', 'seoOptimize'], promptVersion: 'humanize.v2' },
    bulkOperations: { fallbackTasks: ['keywordResearch', 'seoOptimize'], promptVersion: 'bulk.v1' },
    voiceSeedGeneration: { fallbackTasks: ['draftGeneration', 'seoOptimize'], promptVersion: 'voice-seed.v1' },
    aiReview: { fallbackTasks: ['humanization', 'seoOptimize'], promptVersion: 'ai-review.v1' },
    research: { fallbackTasks: ['seoOptimize'], promptVersion: 'research.v1' },
    blockContent: { fallbackTasks: ['draftGeneration', 'humanization'], promptVersion: 'block-content.v1' },
};

// Pricing per 1K tokens (approximate, check OpenRouter for current)
const MODEL_PRICING: Record<string, { input: number; output: number; perRequestFee?: number }> = {
    'x-ai/grok-3-fast': { input: 0.005, output: 0.025 },
    'anthropic/claude-sonnet-4-5-20250929': { input: 0.003, output: 0.015 },
    'anthropic/claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
    'perplexity/sonar-reasoning': { input: 0.001, output: 0.005, perRequestFee: 0.01 },
};

interface BaseAIResponse {
    content: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs: number;
}

export interface AIResponse extends BaseAIResponse {
    modelKey: AIModelTask;
    resolvedModel: string;
    promptVersion: string;
    routingVersion: string;
    fallbackUsed: boolean;
    fallbackIndex: number;
}

export interface GenerateOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    promptVersion?: string;
}

interface OpenRouterResponse {
    id: string;
    choices: Array<{
        message: {
            content: string;
            role: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    model: string;
}

class OpenRouterHttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'OpenRouterHttpError';
        this.status = status;
    }
}

export class OpenRouterClient {
    private apiKey: string;
    private baseUrl = 'https://openrouter.ai/api/v1';
    private maxAttempts = 3;
    private baseDelay = 1000;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('OPENROUTER_API_KEY is required');
        }
    }

    /**
     * Generate content using the specified task type
     * Model is automatically selected based on task
     */
    async generate(
        task: AIModelTask,
        prompt: string,
        options: GenerateOptions = {}
    ): Promise<AIResponse> {
        const routingProfile = MODEL_ROUTING_REGISTRY[task];
        const promptVersion = options.promptVersion || routingProfile.promptVersion;
        const configuredModels = [
            options.model || MODEL_CONFIG[task],
            ...routingProfile.fallbackTasks.map((fallbackTask) => MODEL_CONFIG[fallbackTask]),
            EMERGENCY_FALLBACK_MODEL,
        ];
        const modelsToTry = configuredModels.filter((model, idx) => configuredModels.indexOf(model) === idx);

        let lastError: unknown;
        for (let index = 0; index < modelsToTry.length; index += 1) {
            const model = modelsToTry[index];
            try {
                const response = await this.generateWithModel(model, prompt, options);
                const resolvedModel = response.model || model;
                return {
                    ...response,
                    modelKey: task,
                    resolvedModel,
                    promptVersion,
                    routingVersion: MODEL_ROUTING_VERSION,
                    fallbackUsed: index > 0,
                    fallbackIndex: index,
                };
            } catch (error) {
                lastError = error;
            }
        }

        const attempted = modelsToTry.join(', ');
        const baseMessage = `All configured models failed for task "${task}" (attempted: ${attempted})`;
        if (lastError instanceof Error) {
            throw new Error(`${baseMessage}: ${lastError.message}`);
        }
        throw new Error(baseMessage);
    }

    /**
     * Generate content with a specific model
     */
    async generateWithModel(
        model: string,
        prompt: string,
        options: GenerateOptions = {}
    ): Promise<BaseAIResponse> {
        const startTime = Date.now();
        return withCircuitBreaker(
            'openrouter',
            () =>
                withRetry(
                    async () => {
                        const messages: Array<{ role: string; content: string }> = [];

                        if (options.systemPrompt) {
                            messages.push({ role: 'system', content: options.systemPrompt });
                        }
                        messages.push({ role: 'user', content: prompt });

                        const response = await fetch(`${this.baseUrl}/chat/completions`, {
                            method: 'POST',
                            headers: {
                                Authorization: `Bearer ${this.apiKey}`,
                                'Content-Type': 'application/json',
                                'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000',
                                'X-Title': 'Domain Empire',
                            },
                            body: JSON.stringify({
                                model,
                                messages,
                                temperature: options.temperature ?? 0.7,
                                max_tokens: options.maxTokens ?? 4096,
                            }),
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            throw new OpenRouterHttpError(
                                response.status,
                                `OpenRouter API error: ${response.status} - ${errorText}`,
                            );
                        }

                        const data: OpenRouterResponse = await response.json();
                        const durationMs = Date.now() - startTime;
                        const cost = this.calculateCost(
                            model,
                            data.usage.prompt_tokens,
                            data.usage.completion_tokens,
                        );

                        return {
                            content: data.choices[0]?.message?.content || '',
                            model: data.model,
                            inputTokens: data.usage.prompt_tokens,
                            outputTokens: data.usage.completion_tokens,
                            cost,
                            durationMs,
                        };
                    },
                    {
                        maxRetries: Math.max(0, this.maxAttempts - 1),
                        baseDelayMs: this.baseDelay,
                        maxDelayMs: 30_000,
                        label: `openrouter:${model}`,
                        retryOn: (error: unknown) => this.isRetryableError(error),
                    },
                ),
        );
    }

    /**
     * Generate with JSON output (for structured responses)
     */
    async generateJSON<T>(
        task: AIModelTask,
        prompt: string,
        options: GenerateOptions = {}
    ): Promise<{ data: T } & Omit<AIResponse, 'content'>> {
        const response = await this.generate(task, prompt, {
            ...options,
            systemPrompt: `${options.systemPrompt || ''}\n\nRespond with valid JSON only. No markdown, no code blocks, just raw JSON.`.trim(),
        });

        try {
            // Try to extract JSON from the response
            let jsonStr = response.content.trim();

            // Remove markdown code blocks if present
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            const data = JSON.parse(jsonStr) as T;
            return {
                data,
                modelKey: response.modelKey,
                model: response.model,
                resolvedModel: response.resolvedModel,
                promptVersion: response.promptVersion,
                routingVersion: response.routingVersion,
                fallbackUsed: response.fallbackUsed,
                fallbackIndex: response.fallbackIndex,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                cost: response.cost,
                durationMs: response.durationMs,
            };
        } catch (parseError) {
            throw new Error(`Failed to parse JSON response: ${parseError}. Raw content: ${response.content.slice(0, 500)}`);
        }
    }

    /**
     * Calculate cost for an API call
     */
    private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
        const pricing = MODEL_PRICING[model] || { input: 0.01, output: 0.03 }; // Default fallback
        return (inputTokens * pricing.input / 1000) + (outputTokens * pricing.output / 1000);
    }

    private isRetryableError(error: unknown): boolean {
        if (error instanceof OpenRouterHttpError) {
            return error.status === 429 || error.status >= 500;
        }
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            return (
                message.includes('fetch failed') ||
                message.includes('timeout') ||
                message.includes('econnrefused') ||
                message.includes('econnreset') ||
                message.includes('socket hang up') ||
                message.includes('network')
            );
        }
        return false;
    }
}

// Singleton instance
let clientInstance: OpenRouterClient | null = null;

export function getAIClient(): OpenRouterClient {
    if (!clientInstance) {
        clientInstance = new OpenRouterClient();
    }
    return clientInstance;
}

// Export for testing
export function createAIClient(apiKey: string): OpenRouterClient {
    return new OpenRouterClient(apiKey);
}
