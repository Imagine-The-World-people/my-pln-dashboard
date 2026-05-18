import { createClient } from '@supabase/supabase-js';

// =============================================
// Supabase Configuration
// =============================================
// Environment variables are injected at runtime by Vercel
// For local development, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
// See .env.example for format

// Read from window.__ENV__ (set by Vercel) or fallback to hardcoded values (local dev)
const getConfig = () => {
    // In production (Vercel), window.__ENV__ is injected via script
    if (typeof window !== 'undefined' && window.__ENV__) {
        return {
            url: window.__ENV__.SUPABASE_URL,
            key: window.__ENV__.SUPABASE_ANON_KEY
        };
    }
    
    // Fallback for local development (from .env.local)
    return {
        url: 'https://hcnuvchhxuknlycjonhk.supabase.co',
        key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbnV2Y2hoeHVrbmx5Y2pvbmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTk2NTAsImV4cCI6MjA5NDU5NTY1MH0.kMmwxLeDa6jeJRfeSpXQX1GWX7oknHQPgsiGxt_MpEE'
    };
};

const config = getConfig();
const SUPABASE_URL = config.url;
const SUPABASE_ANON_KEY = config.key;

// Only initialize if the config has been filled in
export const supabaseClient = SUPABASE_URL.startsWith('PASTE_') || !SUPABASE_URL
    ? null
    : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { flowType: 'implicit' }
    });
