-- מעתיק (לא מעביר) את המצב של בית חדש / כספים / נתוני ליבה מהשורות האישיות של ה-owner אל המרחב המשותף.
-- ה-source ב-company_state נשאר שלם, ולכן אפשר לחזור אחורה בכל רגע (090_revert_copy.sql). idempotent: הרצה נוספת לא דורסת.
-- בריאות / נפשי / קריירה בכוונה לא מופיעים כאן. כל מפתח שאינו ברשימה נשאר אישי.
-- החלטה שדורשת אישור לפני ההרצה: hq:kesef:v1 כולל שווי נקי, נכסים ומעקב מניות; hq:core:v1 כולל את שתי המשכורות והמשכנתא.
insert into public.workspace_state (workspace_id, company_key, data)
select '<WORKSPACE_ID>'::uuid, cs.company_key, cs.data
from public.company_state cs
where cs.user_id = '<OWNER_USER_UUID>'::uuid
  and cs.company_key in ('hq:beit-hadash:v2', 'hq:kesef:v1', 'hq:core:v1')
on conflict (workspace_id, company_key) do nothing;

-- אימות: מה הועתק
select company_key, jsonb_typeof(data) as json_type, length(data::text) as bytes
from public.workspace_state where workspace_id = '<WORKSPACE_ID>'::uuid order by company_key;
