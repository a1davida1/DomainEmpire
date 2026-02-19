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

const FAST_MODEL = envModel('OPENROUTER_MODEL_FAST', 'x-ai/grok-4.1-fast');
const SEO_MODEL = envModel('OPENROUTER_MODEL_SEO', 'x-ai/grok-4.1-fast');
const QUALITY_MODEL = envModel('OPENROUTER_MODEL_QUALITY', 'anthropic/claude-sonnet-4.5');
const REVIEW_MODEL = envModel('OPENROUTER_MODEL_REVIEW', 'anthropic/claude-opus-4.6');
const RESEARCH_MODEL = envModel('OPENROUTER_MODEL_RESEARCH', 'x-ai/grok-4.1-fast');
const VISION_MODEL = envModel('OPENROUTER_MODEL_VISION', 'google/gemini-2.0-flash-001');
const IMAGE_GEN_FAST_MODEL = envModel('OPENROUTER_MODEL_IMAGE_GEN_FAST', 'google/gemini-2.5-flash-image');
// Intentionally same as FAST — no higher-quality image model available on OpenRouter yet
const IMAGE_GEN_QUALITY_MODEL = envModel('OPENROUTER_MODEL_IMAGE_GEN_QUALITY', 'google/gemini-2.5-flash-image');
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

    // Vision (Gemini Flash)
    vision: VISION_MODEL,

    // Image generation (Gemini)
    imageGenFast: IMAGE_GEN_FAST_MODEL,
    imageGenQuality: IMAGE_GEN_QUALITY_MODEL,
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
    research: { fallbackTasks: ['draftGeneration', 'seoOptimize'], promptVersion: 'research.v1' },
    blockContent: { fallbackTasks: ['draftGeneration', 'humanization'], promptVersion: 'block-content.v1' },
    vision: { fallbackTasks: [], promptVersion: 'vision.v1' },
    imageGenFast: { fallbackTasks: ['imageGenQuality'], promptVersion: 'image-gen.v1' },
    imageGenQuality: { fallbackTasks: ['imageGenFast'], promptVersion: 'image-gen.v1' },
};

// Pricing per 1K tokens (approximate, check OpenRouter for current)
const MODEL_PRICING: Record<string, { input: number; output: number; perRequestFee?: number }> = {
    'anthropic/claude-opus-4.6': { input: 0.015, output: 0.075 },
    'anthropic/claude-sonnet-4.5': { input: 0.003, output: 0.015 },
    'x-ai/grok-4.1-fast': { input: 0.003, output: 0.015 },
    'x-ai/grok-3-fast': { input: 0.005, output: 0.025 },
    'anthropic/claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
    'perplexity/sonar-pro': { input: 0.003, output: 0.015, perRequestFee: 0.005 },
    'perplexity/sonar-reasoning': { input: 0.001, output: 0.005, perRequestFee: 0.01 },
    'google/gemini-2.5-flash-image': { input: 0.0001, output: 0.0004 },
    'google/gemini-2.0-flash-001': { input: 0.0001, output: 0.0004 },
    'google/gemini-2.0-flash-exp:free': { input: 0, output: 0 },
    'google/gemini-2.5-pro-preview': { input: 0.00125, output: 0.01 },
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

export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

type VisionMessage = {
    role: string;
    content: string | ContentPart[];
};

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

interface OpenRouterImageResponsePart {
    type: string;
    text?: string;
    image_url?: { url: string };
}

interface OpenRouterImageResponse {
    id?: string;
    choices?: Array<{
        message?: {
            content: string | OpenRouterImageResponsePart[];
            role?: string;
        };
        finish_reason?: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
    };
    model?: string;
}

export interface ImageGenResponse {
    base64: string;
    mimeType: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs: number;
}

class OpenRouterHttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'OpenRouterHttpError';
        this.status = status;
    }
}

/** Thrown when a model returns HTTP 200 but the content is a refusal. Not retryable. */
class ModelRefusalError extends Error {
    constructor(model: string, snippet: string) {
        super(`Model ${model} refused the request: ${snippet}`);
        this.name = 'ModelRefusalError';
    }
}

const REFUSAL_PATTERNS = [
    'I appreciate you', 'I need to clarify', 'I cannot fulfill',
    'falls outside my', 'I\'m Perplexity', 'I can\'t generate',
    'contradicts my commitment', 'outside my core function',
    'I\'m unable to', 'I must decline',
];

export class OpenRouterClient {
    private static readonly FETCH_TIMEOUT_MS = 120_000;
    private apiKey: string;
    private baseUrl = 'https://openrouter.ai/api/v1';
    private maxAttempts = 3;
    private baseDelay = 1000;

    constructor(apiKey?: string) {
        const key = (apiKey || process.env.OPENROUTER_API_KEY || '').trim();
        if (!key) {
            throw new Error(
                'OPENROUTER_API_KEY is required. Set it in your .env.local file or pass it to the constructor.',
            );
        }
        this.apiKey = key;
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
                            signal: AbortSignal.timeout(OpenRouterClient.FETCH_TIMEOUT_MS),
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
                        const resolvedModel = data.model || model;
                        const content = data.choices[0]?.message?.content || '';

                        // Detect refusals — models that return 200 but refuse the task.
                        // Throws non-retryable error so generate() falls back to next model.
                        const contentHead = content.slice(0, 300);
                        if (REFUSAL_PATTERNS.some(p => contentHead.includes(p))) {
                            throw new ModelRefusalError(resolvedModel, content.slice(0, 200));
                        }

                        const cost = this.calculateCost(
                            resolvedModel,
                            data.usage.prompt_tokens,
                            data.usage.completion_tokens,
                        );

                        return {
                            content,
                            model: resolvedModel,
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
            let jsonStr = response.content.trim();
            // Remove markdown code blocks if present
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            // Strip leading text before first brace
            const firstBrace = jsonStr.indexOf('{');
            if (firstBrace > 0 && firstBrace < 200) {
                jsonStr = jsonStr.slice(firstBrace);
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
            throw new Error(`Failed to parse JSON response from ${response.resolvedModel}: ${parseError}. Raw content: ${response.content.slice(0, 500)}`);
        }
    }

    /**
     * Generate with vision (multimodal) - sends images alongside text prompt.
     * Images can be base64 data URLs or https URLs.
     */
    async generateWithVision(
        task: AIModelTask,
        prompt: string,
        imageUrls: string[],
        options: GenerateOptions = {},
    ): Promise<AIResponse> {
        const routingProfile = MODEL_ROUTING_REGISTRY[task];
        const promptVersion = options.promptVersion || routingProfile.promptVersion;
        const model = options.model || MODEL_CONFIG[task];
        const startTime = Date.now();

        const contentParts: ContentPart[] = [
            { type: 'text', text: prompt },
            ...imageUrls.map((url) => ({
                type: 'image_url' as const,
                image_url: { url },
            })),
        ];

        const messages: VisionMessage[] = [];
        if (options.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }
        messages.push({ role: 'user', content: contentParts });

        const response = await withCircuitBreaker(
            'openrouter',
            () =>
                withRetry(
                    async () => {
                        const res = await fetch(`${this.baseUrl}/chat/completions`, {
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
                                temperature: options.temperature ?? 0.5,
                                max_tokens: options.maxTokens ?? 2048,
                            }),
                            signal: AbortSignal.timeout(OpenRouterClient.FETCH_TIMEOUT_MS),
                        });

                        if (!res.ok) {
                            const errorText = await res.text();
                            throw new OpenRouterHttpError(
                                res.status,
                                `OpenRouter Vision API error: ${res.status} - ${errorText}`,
                            );
                        }

                        const data: OpenRouterResponse = await res.json();
                        const durationMs = Date.now() - startTime;
                        const resolvedModel = data.model || model;
                        const cost = this.calculateCost(
                            resolvedModel,
                            data.usage.prompt_tokens,
                            data.usage.completion_tokens,
                        );

                        return {
                            content: data.choices[0]?.message?.content || '',
                            model: resolvedModel,
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
                        label: `openrouter-vision:${model}`,
                        retryOn: (error: unknown) => this.isRetryableError(error),
                    },
                ),
        );

        return {
            ...response,
            modelKey: task,
            resolvedModel: response.model || model,
            promptVersion,
            routingVersion: MODEL_ROUTING_VERSION,
            fallbackUsed: false,
            fallbackIndex: 0,
        };
    }

    /**
     * Generate an image using a Gemini model via OpenRouter.
     * Returns base64-encoded image data (PNG) or null if generation fails.
     */
    async generateImage(
        task: AIModelTask,
        prompt: string,
        options: GenerateOptions & { width?: number; height?: number } = {},
    ): Promise<ImageGenResponse | null> {
        const model = options.model || MODEL_CONFIG[task];
        const startTime = Date.now();

        try {
            const response = await withCircuitBreaker(
                'openrouter',
                () =>
                    withRetry(
                        async () => {
                            const res = await fetch(`${this.baseUrl}/chat/completions`, {
                                method: 'POST',
                                headers: {
                                    Authorization: `Bearer ${this.apiKey}`,
                                    'Content-Type': 'application/json',
                                    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000',
                                    'X-Title': 'Domain Empire',
                                },
                                body: JSON.stringify({
                                    model,
                                    messages: [
                                        {
                                            role: 'user',
                                            content: prompt,
                                        },
                                    ],
                                    temperature: options.temperature ?? 0.8,
                                    max_tokens: options.maxTokens ?? 4096,
                                    // Request image output from Gemini
                                    modalities: ['text', 'image'],
                                    ...(options.width && options.height
                                        ? { image_size: { width: options.width, height: options.height } }
                                        : {}),
                                }),
                                signal: AbortSignal.timeout(OpenRouterClient.FETCH_TIMEOUT_MS),
                            });

                            if (!res.ok) {
                                const errorText = await res.text();
                                throw new OpenRouterHttpError(
                                    res.status,
                                    `OpenRouter Image Gen error: ${res.status} - ${errorText}`,
                                );
                            }

                            return res.json();
                        },
                        {
                            maxRetries: Math.max(0, this.maxAttempts - 1),
                            baseDelayMs: this.baseDelay,
                            maxDelayMs: 30_000,
                            label: `openrouter-imagegen:${model}`,
                            retryOn: (error: unknown) => this.isRetryableError(error),
                        },
                    ),
            );

            const durationMs = Date.now() - startTime;
            const data = response as OpenRouterImageResponse;
            const choice = data.choices?.[0];

            if (!choice) return null;

            // Extract base64 image from multimodal response.
            // OpenRouter returns images in several possible locations depending on the model:
            //   1. choice.message.images[] — Gemini image models use this
            //   2. choice.message.content (array with image_url parts)
            //   3. choice.message.content (string with inline data URI)
            const message = choice.message as Record<string, unknown>;
            const content = message?.content;
            let imageBase64: string | null = null;

            // 1. Check message.images[] (Gemini via OpenRouter)
            const images = message?.images;
            if (Array.isArray(images)) {
                for (const img of images) {
                    const imgObj = img as { type?: string; image_url?: { url?: string } };
                    if (imgObj.image_url?.url) {
                        const urlMatch = imgObj.image_url.url.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
                        if (urlMatch) {
                            imageBase64 = urlMatch[2];
                            break;
                        }
                    }
                }
            }

            // 2. Check content array (standard multimodal format)
            if (!imageBase64 && Array.isArray(content)) {
                for (const part of content) {
                    const p = part as { type?: string; image_url?: { url?: string } };
                    if (p.type === 'image_url' && p.image_url?.url) {
                        const urlMatch = p.image_url.url.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
                        if (urlMatch) {
                            imageBase64 = urlMatch[2];
                            break;
                        }
                    }
                }
            }

            // 3. Check content string for inline data URI
            if (!imageBase64 && typeof content === 'string') {
                const b64Match = content.match(/data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)/);
                if (b64Match) {
                    imageBase64 = b64Match[2];
                }
            }

            if (!imageBase64) return null;

            const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
            const resolvedModel = data.model || model;
            return {
                base64: imageBase64,
                mimeType: 'image/png',
                model: resolvedModel,
                inputTokens: usage.prompt_tokens,
                outputTokens: usage.completion_tokens,
                cost: this.calculateCost(resolvedModel, usage.prompt_tokens, usage.completion_tokens),
                durationMs,
            };
        } catch (error) {
            console.error(`[ImageGen] Failed with model ${model}:`, error instanceof Error ? error.message : error);
            return null;
        }
    }

    /**
     * Calculate cost for an API call
     */
    private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
        const pricing = MODEL_PRICING[model] || { input: 0.01, output: 0.03 };
        return (inputTokens * pricing.input / 1000) + (outputTokens * pricing.output / 1000) + (pricing.perRequestFee || 0);
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

// Singleton instance - re-creates if API key changes (e.g. after env refresh)
let clientInstance: OpenRouterClient | null = null;
let clientApiKeySnapshot: string | undefined;

export function getAIClient(): OpenRouterClient {
    const currentKey = process.env.OPENROUTER_API_KEY;
    if (!clientInstance || currentKey !== clientApiKeySnapshot) {
        clientInstance = new OpenRouterClient(currentKey);
        clientApiKeySnapshot = currentKey;
    }
    return clientInstance;
}

// Export for testing
export function createAIClient(apiKey: string): OpenRouterClient {
    return new OpenRouterClient(apiKey);
}
