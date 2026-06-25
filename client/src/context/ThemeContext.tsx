import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    isAnimationPaused: boolean;
    toggleAnimation: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Initialize theme from localStorage or default to 'dark'
    const [theme, setTheme] = useState<Theme>(() => {
        const savedTheme = localStorage.getItem('theme');
        return (savedTheme as Theme) || 'dark';
    });

    // Initialize animation pause state from localStorage (default: paused)
    const [isAnimationPaused, setIsAnimationPaused] = useState<boolean>(() => {
        const saved = localStorage.getItem('isAnimationPaused');
        return saved === null ? true : saved === 'true';
    });

    useEffect(() => {
        // Update localStorage when theme changes
        localStorage.setItem('theme', theme);
        if (theme === 'light') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
    }, [theme]);

    useEffect(() => {
        // Update localStorage when animation state changes
        localStorage.setItem('isAnimationPaused', String(isAnimationPaused));
    }, [isAnimationPaused]);

    const toggleTheme = () => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        // Modern Web Guidance: use View Transition API for a smooth cross-fade.
        // Browsers that don't support it fall back to an instant swap.
        if (!document.startViewTransition) {
            setTheme(next);
            return;
        }
        document.startViewTransition(() => {
            setTheme(next);
        });
    };

    const toggleAnimation = () => {
        setIsAnimationPaused(prev => !prev);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, isAnimationPaused, toggleAnimation }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
