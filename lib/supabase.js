import { createClient } from "@supabase/supabase-js";

// לקוח Supabase יחיד לכל האפליקציה (מפתח ציבורי בלבד — מוגן ע"י RLS)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
