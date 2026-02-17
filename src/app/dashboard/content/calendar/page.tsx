'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface CalendarArticle {
    id: string;
    title: string;
    status: string;
    contentType: string | null;
    createdAt: string;
}

interface CalendarData {
    articles: CalendarArticle[];
    summary: { totalArticles: number; byStatus: Record<string, number>; daysWithContent: number };
}

const STATUS_COLORS: Record<string, string> = {
    published: 'bg-green-500',
    draft: 'bg-yellow-500',
    review: 'bg-blue-500',
    generating: 'bg-purple-500',
    approved: 'bg-emerald-500',
    archived: 'bg-gray-400',
};

function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
    return new Date(year, month, 1).getDay();
}

export default function CalendarPage() {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [data, setData] = useState<CalendarData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const endDate = new Date(year, month + 1, 0);
        const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
        fetch(`/api/content/calendar?start=${start}&end=${end}`, { signal: controller.signal })
            .then(async (res) => {
                if (res.ok) {
                    setData(await res.json());
                } else {
                    setError('Failed to load calendar data');
                    setData(null);
                }
            })
            .catch((e) => {
                if (e instanceof DOMException && e.name === 'AbortError') return;
                console.error('Calendar fetch failed:', e);
                setError('Could not connect to server');
                setData(null);
            })
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, [year, month]);

    function prevMonth() {
        setLoading(true);
        setError(null);
        if (month === 0) { setYear(y => y - 1); setMonth(11); }
        else setMonth(m => m - 1);
        setSelectedDay(null);
    }

    function nextMonth() {
        setLoading(true);
        setError(null);
        if (month === 11) { setYear(y => y + 1); setMonth(0); }
        else setMonth(m => m + 1);
        setSelectedDay(null);
    }

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfWeek(year, month);
    const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });

    // Group articles by day
    const articlesByDay = new Map<number, CalendarArticle[]>();
    if (data?.articles) {
        for (const a of data.articles) {
            const day = new Date(a.createdAt).getDate();
            const list = articlesByDay.get(day) || [];
            list.push(a);
            articlesByDay.set(day, list);
        }
    }

    const selectedArticles = selectedDay ? (articlesByDay.get(selectedDay) || []) : [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Content Calendar</h1>
                    <p className="text-muted-foreground">Articles published and created over time</p>
                </div>
            </div>

            {/* Stats */}
            {data?.summary && (
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Articles This Month</p>
                            <p className="mt-1 text-2xl font-bold">{data.summary.totalArticles}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Active Days</p>
                            <p className="mt-1 text-2xl font-bold">{data.summary.daysWithContent}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Published</p>
                            <p className="mt-1 text-2xl font-bold text-green-600">{data.summary.byStatus?.published || 0}</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Calendar */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            {monthName} {year}
                        </CardTitle>
                        <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={prevMonth}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={nextMonth}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center p-12 text-muted-foreground">Loading...</div>
                    ) : error ? (
                        <div className="flex items-center justify-center p-12 text-destructive">{error}</div>
                    ) : (
                        <>
                            {/* Day headers */}
                            <div className="grid grid-cols-7 gap-1 mb-1">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                                ))}
                            </div>
                            {/* Day cells */}
                            <div className="grid grid-cols-7 gap-1">
                                {Array.from({ length: firstDay }, (_, i) => (
                                    <div key={`empty-${i}`} className="h-20" />
                                ))}
                                {Array.from({ length: daysInMonth }, (_, i) => {
                                    const day = i + 1;
                                    const dayArticles = articlesByDay.get(day) || [];
                                    const isSelected = selectedDay === day;
                                    const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
                                    return (
                                        <button
                                            key={day}
                                            onClick={() => setSelectedDay(isSelected ? null : day)}
                                            className={`h-20 border rounded p-1 text-left transition-colors hover:bg-accent/50 ${isSelected ? 'ring-2 ring-primary bg-accent/30' : ''
                                                } ${isToday ? 'border-primary' : ''}`}
                                        >
                                            <span className={`text-xs font-medium ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                                                {day}
                                            </span>
                                            {dayArticles.length > 0 && (
                                                <div className="mt-1 flex gap-0.5 flex-wrap">
                                                    {dayArticles.slice(0, 3).map((a) => (
                                                        <div
                                                            key={a.id}
                                                            className={`w-2 h-2 rounded-full ${STATUS_COLORS[a.status] || 'bg-gray-300'}`}
                                                            title={`${a.title} (${a.status})`}
                                                        />
                                                    ))}
                                                    {dayArticles.length > 3 && (
                                                        <span className="text-[10px] text-muted-foreground">+{dayArticles.length - 3}</span>
                                                    )}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Legend */}
                            <div className="flex gap-4 mt-4 text-xs text-muted-foreground flex-wrap">
                                {Object.entries(STATUS_COLORS).map(([status, color]) => (
                                    <div key={status} className="flex items-center gap-1">
                                        <div className={`w-2 h-2 rounded-full ${color}`} />
                                        {status}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Selected day detail */}
            {selectedDay && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {monthName} {selectedDay}, {year} — {selectedArticles.length} article{selectedArticles.length !== 1 ? 's' : ''}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {selectedArticles.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No articles on this day.</p>
                        ) : (
                            <div className="space-y-2">
                                {selectedArticles.map(a => (
                                    <a
                                        key={a.id}
                                        href={`/dashboard/content/articles/${a.id}`}
                                        className="flex items-center justify-between border rounded-lg p-3 hover:bg-accent/50 transition-colors"
                                    >
                                        <div>
                                            <p className="font-medium text-sm">{a.title}</p>
                                            <p className="text-xs text-muted-foreground">{a.contentType || 'article'}</p>
                                        </div>
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white ${STATUS_COLORS[a.status] || 'bg-gray-400'}`}>
                                            {a.status}
                                        </span>
                                    </a>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
