// Route דק: כל הלוגיקה ב-lib/hevy-handler.mjs (שער -> בדיקת מפתח מול Hevy -> הצפנה -> שמירה).
import { createApiGuard } from "@/lib/server-auth.mjs";
import { createHevyConnectHandler } from "@/lib/hevy-handler.mjs";
import { createHevyService } from "@/lib/hevy-service.mjs";
import { getSupabaseAdmin } from "@/lib/supabase-admin.mjs";

export const dynamic = "force-dynamic";

export const POST = createHevyConnectHandler({
  guard: createApiGuard(),
  getEncryptionSecret: () => process.env.HEVY_KEY_ENCRYPTION_SECRET,
  getAdmin: getSupabaseAdmin,
  service: createHevyService(),
});
