import { createClient } from "@supabase/supabase-js";

// Lese die Supabase URL und den Anon Key aus den Umgebungsvariablen
// Diese werden während des Build-Prozesses von Docker (via .env und docker-compose.yml) bereitgestellt
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Überprüfung, ob die Variablen gesetzt sind
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase URL (REACT_APP_SUPABASE_URL) and Anon Key (REACT_APP_SUPABASE_ANON_KEY) must be defined in environment variables."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
