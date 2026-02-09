"use client"

import * as React from "react"

/**
 * ThemeProvider component for theme management.
 * 
 * Note: This is a minimal pass-through implementation. If theme switching 
 * is needed, install next-themes: npm install next-themes
 * Then import and re-export: export { ThemeProvider } from 'next-themes'
 */
interface ThemeProviderProps {
    children: React.ReactNode;
    attribute?: string;
    defaultTheme?: string;
    enableSystem?: boolean;
    disableTransitionOnChange?: boolean;
    [key: string]: unknown;
}

export function ThemeProvider({
    children,
    attribute: _attribute,
    defaultTheme: _defaultTheme,
    enableSystem: _enableSystem,
    disableTransitionOnChange: _disableTransitionOnChange,
    ...props
}: ThemeProviderProps) {
    return <>{children}</>
}
