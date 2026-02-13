'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

interface ContentEditorProps {
    articleId: string;
    initialTitle: string;
    initialSlug: string;
    initialContent: string;
    initialKeyword?: string;
    initialMetaDescription?: string;
}

export function ContentEditor({
    articleId,
    initialTitle,
    initialSlug,
    initialContent,
    initialKeyword = '',
    initialMetaDescription = ''
}: ContentEditorProps) {
    const [title, setTitle] = useState(initialTitle);
    const [slug, setSlug] = useState(initialSlug);
    const [content, setContent] = useState(initialContent);
    const [targetKeyword, setTargetKeyword] = useState(initialKeyword);
    const [metaDescription, setMetaDescription] = useState(initialMetaDescription);
    const [isSaving, setIsSaving] = useState(false);
    const [isRefining, setIsRefining] = useState(false);
    const { toast } = useToast();

    const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);

    const handleSuggestTitles = async () => {
        setIsSuggesting(true);
        try {
            const res = await fetch('/api/articles/suggest-titles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: title || slug || 'General Topic',
                    keyword: targetKeyword
                }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            if (data.titles && Array.isArray(data.titles)) {
                setSuggestedTitles(data.titles);
                toast({
                    title: "Suggestions Ready",
                    description: "Select a title to apply it.",
                });
            } else {
                toast({
                    title: "No Suggestions",
                    description: "AI returned no title suggestions.",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error('Failed to suggest titles', error);
            toast({
                title: "Error",
                description: "Could not generate titles.",
                variant: "destructive",
            });
        } finally {
            setIsSuggesting(false);
        }
    };

    const applyTitle = (newTitle: string) => {
        setTitle(newTitle);
        setSuggestedTitles([]); // Clear suggestions
        // Auto-update slug if it's empty or looks like a default
        if (!slug || slug === 'new-article') {
            setSlug(newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/articles/${articleId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    slug,
                    content,
                    targetKeyword,
                    metaDescription
                }),
            });

            if (!res.ok) throw new Error('Failed to save');

            toast({
                title: "Saved successfully",
                description: "Article updated.",
            });
        } catch (error) {
            console.error('Failed to save:', error);
            toast({
                title: "Save failed",
                description: "Could not update article.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleRefine = async () => {
        setIsRefining(true);
        try {
            const res = await fetch(`/api/articles/${articleId}/refine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            if (data.refinedContent) {
                setContent(data.refinedContent);
                toast({
                    title: "Refined",
                    description: "Content polished by AI.",
                });
            } else {
                toast({
                    title: "Refinement Issue",
                    description: "No refined content returned.",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error('Failed to suggest titles', error);
            toast({
                title: "Refinement failed",
                description: "Could not refine content.",
                variant: "destructive",
            });
        } finally {
            setIsRefining(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end gap-2 mb-4">
                <Button variant="secondary" onClick={handleRefine} disabled={isRefining}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {isRefining ? 'Polishing...' : 'Refine with AI'}
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
            </div>

            <Card>
                <CardContent className="space-y-4 pt-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <Label>Title</Label>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSuggestTitles}
                                    disabled={isSuggesting}
                                    className="h-7 text-xs"
                                >
                                    {isSuggesting ? (
                                        <Sparkles className="mr-2 h-3 w-3 animate-spin" />
                                    ) : (
                                        <Sparkles className="mr-2 h-3 w-3" />
                                    )}
                                    Suggest Ideas
                                </Button>
                            </div>
                            <Input value={title} onChange={e => setTitle(e.target.value)} />

                            {suggestedTitles.length > 0 && (
                                <div className="mt-2 p-3 bg-muted/50 rounded-md space-y-2 animate-in fade-in slide-in-from-top-2">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">AI Suggestions:</p>
                                    {suggestedTitles.map((t, i) => (
                                        <button
                                            type="button"
                                            key={i}
                                            onClick={() => applyTitle(t)}
                                            className="block w-full text-left text-sm p-2 hover:bg-background rounded transition-colors border border-transparent hover:border-border"
                                        >
                                            {t}
                                        </button>
                                    ))}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSuggestedTitles([])}
                                        className="w-full text-xs h-6 mt-1 text-muted-foreground"
                                    >
                                        Dismiss
                                    </Button>
                                </div>
                            )}
                        </div>
                        <div>
                            <Label>Slug</Label>
                            <Input value={slug} onChange={e => setSlug(e.target.value)} />
                        </div>
                    </div>
                    <div>
                        <Label>Content (Markdown)</Label>
                        <Textarea
                            className="min-h-[600px] font-mono text-sm mt-2"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-4 pt-6">
                    <div className="font-semibold mb-2">SEO & Metadata</div>
                    <div>
                        <Label>Target Keyword</Label>
                        <Input value={targetKeyword} onChange={e => setTargetKeyword(e.target.value)} />
                    </div>
                    <div>
                        <Label>Meta Description</Label>
                        <Textarea
                            className="h-24 font-normal mt-2"
                            value={metaDescription}
                            onChange={e => setMetaDescription(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
