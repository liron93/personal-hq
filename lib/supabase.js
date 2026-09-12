import { createClient } from "@supabase/supabase-js";

// מפתח ציבורי בלבד — ההרשאות והבידוד נאכפים ב־RLS של Supabase.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      experimental: { passkey: true },
    },
  }
);
