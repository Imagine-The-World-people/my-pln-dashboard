// =============================================
// Supabase Configuration
// =============================================
// Følg trinnene i guiden for å fylle inn verdiene nedenfor.
// Disse finner du i Supabase Console → Settings → API

const SUPABASE_URL      = 'https://hcnuvchhxuknlycjonhk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbnV2Y2hoeHVrbmx5Y2pvbmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTk2NTAsImV4cCI6MjA5NDU5NTY1MH0.kMmwxLeDa6jeJRfeSpXQX1GWX7oknHQPgsiGxt_MpEE';

// Only initialize if the config has been filled in
const supabaseClient = SUPABASE_URL.startsWith('PASTE_')
    ? null
    : supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { flowType: 'implicit' }
    });
