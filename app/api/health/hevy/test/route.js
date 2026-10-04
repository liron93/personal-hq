// Route דק: בדיקת חיבור פעילה מול Hevy, על המפתח השמור (מפוענח רק בזיכרון השרת לרגע הקריאה).
import { createApiGuard } from "@/lib/server-auth.mjs";
import { createHevyTestHandler } from "@/lib/hevy-handler.mjs";
import { createHevyService } from "@/lib/hevy-service.mjs";
import { getSupabaseAdmin } from "@/lib/supabase-admin.mjs";

export const dynamic = "force-dynamic";

export const POST = createHevyTestHandler({
  guard: createApiGuard(),
  getEncryptionSecret: () => process.env.HEVY_KEY_ENCRYPTION_SECRET,
  getAdmin: getSupabaseAdmin,
  service: createHevyService(),
});
