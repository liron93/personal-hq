-- שומר בטיחות: מסרב לרוץ אם זה לא פרויקט staging ריק (אין טבלאות ב-public ואין משתמשים ב-auth.users).
-- מונע הרצה בטעות על production. קריאה בלבד: לא משנה כלום, רק זורק שגיאה.
do $$
declare t int; u int;
begin
  select count(*) into t from pg_tables where schemaname = 'public';
  select count(*) into u from auth.users;
  if t > 0 or u > 0 then
    raise exception 'STAGING GUARD: לא ריק (% טבלאות ב-public, % משתמשים). לא מריצים את הבסיס הסינתטי כאן.', t, u using errcode = 'P0001';
  end if;
end $$;
