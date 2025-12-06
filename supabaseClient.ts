import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uenyphrkihqrxvygceqn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlbnlwaHJraWhxcnh2eWdjZXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwMDgyMjIsImV4cCI6MjA3OTU4NDIyMn0.54hKp2bE9_wbQSE0PYSrv7v-2ojgLo7KatGOzEL2q8Q';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);