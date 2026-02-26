import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export const useAuthStore = create((set, get) => ({
    user: null,
    session: null,
    loading: true,

    initialize: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        set({
            session,
            user: session?.user || null,
            loading: false,
        });

        // Listen for auth changes
        supabase.auth.onAuthStateChange((_event, session) => {
            set({
                session,
                user: session?.user || null,
                loading: false,
            });
        });
    },

    signUp: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        return data;
    },

    signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        set({ session: data.session, user: data.user });
        return data;
    },

    signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        set({ session: null, user: null });
    },
}));
