import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Reads from app.json → extra, .env, or Vercel env vars.
// When both are set the app talks to Supabase; otherwise it
// falls back to in-memory mock data so the UI is still browsable.
const SUPABASE_URL =
  Constants.expoConfig?.extra?.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://YOUR_PROJECT.supabase.co';

const SUPABASE_ANON_KEY =
  Constants.expoConfig?.extra?.SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'YOUR_ANON_KEY';

export const isSupabaseConfigured =
  !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
