-- ============================================================================
-- קבצים משותפים של "בית חדש" (חשבוניות, תוכנית נגרות וכו') -- PROPOSED PATCH, NOT APPLIED.
-- תלוי ב-001_rbac_foundation.sql. אותן יכולות בדיוק כמו של חברת בית חדש: אין מנגנון הרשאות שני.
--
-- מבנה נתיב חובה:  <workspace_id>/<אחד-מזהה>-<שם-קובץ>     (תיקייה אחת בלבד, בלי תיקיות משנה)
--   קריאה  = company.beit-hadash.read   (או owner של המרחב)
--   העלאה/החלפה = company.beit-hadash.write
--   מחיקה  = owner של המרחב, או מי שהעלה את הקובץ בעצמו וגם עדיין יש לו company.beit-hadash.write
-- bucket פרטי בלבד (public=false), עם מגבלת גודל וסוגי קבצים סגורה. אין service_role בדפדפן.
-- קבצי career-documents וה-policies שלהם לא נוגעים כאן בכלל.
-- ============================================================================

begin;

-- המרה בטוחה: נתיב עם תיקייה שאינה uuid צריך להידחות (deny), לא לזרוק שגיאה.
create function public.try_uuid(t text) returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

-- האם המשתמש רשאי לקרוא/לכתוב קובץ לפי שם האובייקט (התיקייה הראשונה היא ה-workspace).
create function public.can_access_home_document(object_name text, for_write boolean) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    public.can_access_state(public.try_uuid(split_part(object_name, '/', 1)), 'hq:beit-hadash:v2', for_write),
    false);
$$;

revoke all on function public.try_uuid(text), public.can_access_home_document(text, boolean) from public, anon;
grant execute on function public.try_uuid(text), public.can_access_home_document(text, boolean) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'home-documents', 'home-documents', false, 26214400,  -- 25MB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists home_documents_select on storage.objects;
create policy home_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'home-documents' and public.can_access_home_document(name, false));

drop policy if exists home_documents_insert on storage.objects;
create policy home_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'home-documents' and array_length(storage.foldername(name), 1) = 1 and public.can_access_home_document(name, true));

drop policy if exists home_documents_update on storage.objects;
create policy home_documents_update on storage.objects for update to authenticated
  using (bucket_id = 'home-documents' and public.can_access_home_document(name, true))
  with check (bucket_id = 'home-documents' and array_length(storage.foldername(name), 1) = 1 and public.can_access_home_document(name, true));

drop policy if exists home_documents_delete on storage.objects;
create policy home_documents_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'home-documents'
    and (
      public.is_workspace_owner(coalesce(public.try_uuid(split_part(name, '/', 1)), '00000000-0000-0000-0000-000000000000'::uuid))
      or (public.can_access_home_document(name, true) and owner_id = (select auth.uid())::text)
    )
  );

commit;
