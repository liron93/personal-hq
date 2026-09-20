-- יוצר את המרחב המשותף "בית". להריץ פעם אחת, כ-postgres ב-SQL Editor (לא דרך האפליקציה).
-- החלף את <OWNER_USER_UUID> במזהה של לירון (Dashboard > Authentication > Users). **אל תשמור את המזהה האמיתי בריפו או ב-Issue.**
-- מחזיר את מזהה המרחב: שמור אותו להמשך (<WORKSPACE_ID>).
insert into public.workspaces (kind, name, owner_id)
values ('shared', 'בית משותף', '<OWNER_USER_UUID>'::uuid)
returning id;
