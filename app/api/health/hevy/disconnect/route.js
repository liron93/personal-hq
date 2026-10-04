// Route דק: ניתוק - מוחק את המפתח המוצפן השמור. אין קריאה ל-Hevy בכלל.
import { createApiGuard } from "@/lib/server-auth.mjs";
import { createHevyDisconnectHandler } from "@/lib/hevy-handler.mjs";
import { getSupabaseAdmin } from "@/lib/supabase-admin.mjs";

export const dynamic = "force-dynamic";

export const POST = createHevyDisconnectHandler({
  guard: createApiGuard(),
  getAdmin: getSupabaseAdmin,
});
