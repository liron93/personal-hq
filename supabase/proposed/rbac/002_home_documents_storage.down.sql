-- החזרה לאחור של 002. מסיר policies ופונקציות. ה-bucket נמחק רק אם הוא ריק: אם כבר הועלו קבצים, מייצאים/מוחקים אותם
-- קודם דרך ה-Dashboard (Supabase לא מאפשר מחיקת bucket עם אובייקטים). לא נוגע ב-career-documents.
-- שים לב: ב-production ה-bucket כבר היה קיים לפני 002 (פרטי, בלי מגבלות). ה-down אינו משחזר את המצב הקודם: אם הוא ריק הוא נמחק.
-- כדי רק לבטל את ההקשחה ולהשאיר את ה-bucket: מוחקים את שורת ה-delete מ-storage.buckets למטה.

begin;

drop policy if exists home_documents_delete on storage.objects;
drop policy if exists home_documents_update on storage.objects;
drop policy if exists home_documents_insert on storage.objects;
drop policy if exists home_documents_select on storage.objects;

delete from storage.buckets b
where b.id = 'home-documents' and not exists (select 1 from storage.objects o where o.bucket_id = 'home-documents');

drop function if exists public.can_access_home_document(text, boolean);
drop function if exists public.try_uuid(text);

commit;
