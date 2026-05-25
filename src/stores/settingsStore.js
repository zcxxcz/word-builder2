import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { DEFAULT_SETTINGS, REVIEW_BATCH_LIMIT } from '../utils/constants';

function normalizeSettings(settings) {
    return {
        ...settings,
        review_cap: Math.min(settings.review_cap ?? DEFAULT_SETTINGS.review_cap, REVIEW_BATCH_LIMIT),
    };
}

export const useSettingsStore = create((set, get) => ({
    settings: { ...DEFAULT_SETTINGS },
    loaded: false,

    loadSettings: async (userId) => {
        const { data } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (data) {
            set({
                settings: normalizeSettings({
                    daily_new: data.daily_new ?? DEFAULT_SETTINGS.daily_new,
                    review_cap: data.review_cap ?? DEFAULT_SETTINGS.review_cap,
                    relapse_cap: data.relapse_cap ?? DEFAULT_SETTINGS.relapse_cap,
                    tts_enabled: data.tts_enabled ?? DEFAULT_SETTINGS.tts_enabled,
                    tts_rate: data.tts_rate ?? DEFAULT_SETTINGS.tts_rate,
                }),
                loaded: true,
            });
        } else {
            // Create default settings
            await supabase.from('user_settings').upsert({
                user_id: userId,
                ...DEFAULT_SETTINGS,
            });
            set({ settings: { ...DEFAULT_SETTINGS }, loaded: true });
        }
    },

    updateSettings: async (userId, updates) => {
        const newSettings = normalizeSettings({ ...get().settings, ...updates });
        set({ settings: newSettings });

        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: userId,
                ...newSettings,
                updated_at: new Date().toISOString(),
            });

        if (error) throw error;
    },
}));
