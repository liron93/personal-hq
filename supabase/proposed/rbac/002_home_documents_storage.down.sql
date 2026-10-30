-- החזרה לאחור של 002. מסיר רק את ה-policies והפונקציות ש-002 יצר. **לעולם לא מוחק את ה-bucket `home-documents`**
-- (ב-production הוא היה קיים לפני 002, ואולי מכיל קבצים). לא נוגע ב-career-documents.
-- ה-bucket נשאר פרטי עם ההגבלות שהוגדרו ב-002 (הקשחה שנשארת); כשאין policies, רק service_role ניגש אליו.
--
-- ניקוי ידני נפרד, רק אם באמת רוצים למחוק את ה-bucket (לא חלק מה-rollback; מריצים ידנית ובנפרד, אחרי ייצוא הקבצים):
--   Dashboard > Storage > home-documents > למחוק את הקבצים, ואז Delete bucket.
--   (Supabase לא מאפשר מחיקת bucket עם אובייקטים ב-SQL ישיר; אל תמחקו שורות מ-storage.objects/buckets ידנית.)

begin;

drop policy if exists home_documents_delete on storage.objects;
drop policy if exists home_documents_update on storage.objects;
drop policy if exists home_documents_insert on storage.objects;
drop policy if exists home_documents_select on storage.objects;

drop function if exists public.can_access_home_document(text, boolean);
drop function if exists public.try_uuid(text);

commit;
