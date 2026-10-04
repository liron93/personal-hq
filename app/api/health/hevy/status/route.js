// Route דק: סטטוס חיבור בלבד - לא קורא ל-Hevy בכלל, רק קורא את הסטטוס השמור (ראה "test" לבדיקה פעילה).
import { createApiGuard } from "@/lib/server-auth.mjs";
import { createHevyStatusHandler } from "@/lib/hevy-handler.mjs";
import { getSupabaseAdmin } from "@/lib/supabase-admin.mjs";

export const dynamic = "force-dynamic";

export const GET = createHevyStatusHandler({
  guard: createApiGuard(),
  getEncryptionSecret: () => process.env.HEVY_KEY_ENCRYPTION_SECRET,
  getAdmin: getSupabaseAdmin,
});
