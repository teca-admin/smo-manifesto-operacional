import { createClient } from '@supabase/supabase-js';

// Configuração do Supabase (Easypanel)
const supabaseUrl = 'https://teca-admin-supabase.ly7t0m.easypanel.host/'; 

const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'SMO_Sistema_de_Manifesto_Operacional',
  },
});