// Route דק: שליפת אימונים אחרונים מ-Hevy (קריאה בלבד - GET בלבד, אין POST/PUT/DELETE ל-Hevy
// בשום שלב). מחזיר Preview בלבד; השמירה בפועל ל-state של הבריאות קורית בצד הלקוח
// (companies/health/model.js: importHevyWorkouts, עם dedupe לפי hevySourceId).
import { createApiGuard } from "@/lib/server-auth.mjs";
import { createHevyImportHandler } from "@/lib/hevy-handler.mjs";
import { createHevyService } from "@/lib/hevy-service.mjs";
import { getSupabaseAdmin } from "@/lib/supabase-admin.mjs";

export const dynamic = "force-dynamic";

export const POST = createHevyImportHandler({
  guard: createApiGuard(),
  getEncryptionSecret: () => process.env.HEVY_KEY_ENCRYPTION_SECRET,
  getAdmin: getSupabaseAdmin,
  service: createHevyService(),
});
