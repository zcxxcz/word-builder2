import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const THEMES = {
    CLASSIC: 'classic',
    FLORR: 'florr',
};

export const useThemeStore = create(persist((set) => ({
    theme: THEMES.CLASSIC,
    setTheme: (theme) => {
        set({ theme: theme === THEMES.FLORR ? THEMES.FLORR : THEMES.CLASSIC });
    },
}), {
    name: 'word-builder-theme',
}));
