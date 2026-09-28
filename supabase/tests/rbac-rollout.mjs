// בודק על Postgres אמיתי (PGlite) את סקריפטי ההפעלה וההחזרה של RBAC, לא רק את המדיניות:
// יצירת מרחב, העתקת מצב (idempotent, בלי לגעת במקור), אישור/הסרת חבר, ביטול ההעתקה, ומעגל up -> down -> up.
import { readFile } from "node:fs/promises";
import { buildBase } from "./rbac-runner.mjs";

const root = new URL("../../", import.meta.url);
const read = p => readFile(new URL(p, root), "utf8");
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sub = (sql, map) => Object.entries(map).reduce((s, [k, v]) => s.split(k).join(v), sql);

export async function runRolloutChecks(PGlite) {
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail) });
  const up1 = await read("supabase/proposed/rbac/001_rbac_foundation.sql");
  const up2 = await read("supabase/proposed/rbac/002_home_documents_storage.sql");
  const down1 = await read("supabase/proposed/rbac/001_rbac_foundation.down.sql");
  const down2 = await read("supabase/proposed/rbac/002_home_documents_storage.down.sql");
  const sqlOf = async n => read(`supabase/proposed/rbac/rollout/${n}.sql`);

  const db = await buildBase(PGlite);
  await db.exec(up1); await db.exec(up2);
  await db.exec(`insert into auth.users (id) values ('${OWNER}'), ('${MEMBER}');
    insert into public.company_state (user_id, company_key, data) values
      ('${OWNER}', 'hq:beit-hadash:v2', '{"items":[1]}'), ('${OWNER}', 'hq:kesef:v1', '{"assets":1}'), ('${OWNER}', 'hq:core:v1', '{"salary":1}'),
      ('${OWNER}', 'hq:wellbeing:v3', '{"private":1}'), ('${OWNER}', 'hq:health:v1', '{"private":1}'), ('${OWNER}', 'career-v1', '{"private":1}');`);
  const count = async q => Number((await db.query(q)).rows[0].n);
  const asUser = async (uid, q) => { await db.exec(`begin; select set_config('request.jwt.claim.sub', '${uid}', true); set local role authenticated;`); try { return Number((await db.query(q)).rows[0].n); } finally { await db.exec("rollback"); } };

  // invariant: כל טבלה ב-public מוגנת ב-RLS (כולל הטבלאות החדשות)
  check("every public table has RLS enabled", await count(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`) === 0);
  await db.exec(await read("supabase/proposed/rbac/rollout/000_preflight_checks.sql"));
  check("preflight checks run without error", true);

  const created = await db.query(sub(await sqlOf("010_create_home_workspace"), { "<OWNER_USER_UUID>": OWNER }));
  const ws = created.rows[0].id;
  check("010 creates the workspace and returns its id", /^[0-9a-f-]{36}$/.test(ws));

  const copy = sub(await sqlOf("020_copy_shared_state"), { "<OWNER_USER_UUID>": OWNER, "<WORKSPACE_ID>": ws });
  const [copyInsert] = copy.split(/;\s*\n\s*\n/); // ההוראה הראשונה (INSERT); השנייה היא SELECT לאימות
  await db.exec(copyInsert + ";");
  const keys = (await db.query(`select company_key from public.workspace_state where workspace_id='${ws}' order by 1`)).rows.map(r => r.company_key);
  check("020 copies exactly beit-hadash, kesef and core", JSON.stringify(keys) === JSON.stringify(["hq:beit-hadash:v2", "hq:core:v1", "hq:kesef:v1"]), keys);
  check("020 leaves the personal source rows untouched", await count(`select count(*)::int n from public.company_state where user_id='${OWNER}'`) === 6);
  check("020 does not copy health / wellbeing / career", await count(`select count(*)::int n from public.workspace_state where company_key in ('hq:health:v1','hq:wellbeing:v3','career-v1')`) === 0);
  await db.exec(`update public.workspace_state set data='{"edited":true}' where workspace_id='${ws}' and company_key='hq:kesef:v1'`);
  await db.exec(copyInsert + ";");
  check("020 is idempotent and never overwrites edits", await count(`select count(*)::int n from public.workspace_state where workspace_id='${ws}' and data='{"edited":true}'`) === 1
    && await count(`select count(*)::int n from public.workspace_state where workspace_id='${ws}'`) === 3);

  const approve = sub(await sqlOf("030_approve_member"), { "<OWNER_USER_UUID>": OWNER, "<WORKSPACE_ID>": ws, "<MEMBER_USER_UUID>": MEMBER, "<TEMPLATE>": "partner_full_finance" });
  await db.exec(`insert into public.workspace_state (workspace_id, company_key, data) values ('${ws}', 'hq:kesef-transactions:v1', '{"rows":[]}')`);
  await db.exec(approve);
  check("030 approves the partner with the default package (option B): sees beit-hadash and kesef", await asUser(MEMBER, `select count(*)::int n from public.workspace_state where company_key in ('hq:beit-hadash:v2','hq:kesef:v1')`) === 2);
  check("030 option B sees transactions but cannot change finance (read only)", await asUser(MEMBER, `select count(*)::int n from public.workspace_state where company_key = 'hq:kesef-transactions:v1'`) === 1
    && await asUser(MEMBER, `with u as (update public.workspace_state set data = '{}' where company_key in ('hq:kesef:v1','hq:kesef-transactions:v1') returning 1) select count(*)::int n from u`) === 0);
  check("030 fails closed while placeholders are unreplaced", await db.exec(await sqlOf("030_approve_member")).then(() => false, () => true));
  await db.exec("rollback").catch(() => {});

  await db.exec(sub(await sqlOf("040_remove_member"), { "<OWNER_USER_UUID>": OWNER, "<WORKSPACE_ID>": ws, "<MEMBER_USER_UUID>": MEMBER }));
  check("040 removes access immediately", await asUser(MEMBER, `select count(*)::int n from public.workspace_state`) === 0);

  await db.exec(sub(await sqlOf("090_revert_copy"), { "<WORKSPACE_ID>": ws }));
  check("090 clears the shared copy and keeps the source", await count(`select count(*)::int n from public.workspace_state`) === 0
    && await count(`select count(*)::int n from public.company_state where user_id='${OWNER}'`) === 6);

  // מעגל החזרה: down מסיר את מה שנוסף ולא נוגע בנתונים אישיים; up אחריו עובד שוב.
  await db.exec(down2); await db.exec(down1);
  check("down removes every RBAC table and function", await count(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('workspaces','workspace_state','workspace_members','member_capabilities','capabilities','role_templates','company_capability_map','permission_audit')`) === 0
    && await count(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'rbac\\_%' or p.proname in ('has_capability','is_workspace_owner','is_workspace_member','can_access_state','can_access_home_document','try_uuid'))`) === 0);
  check("down removes the home-documents bucket and policies", await count(`select count(*)::int n from storage.buckets where id='home-documents'`) === 0
    && await count(`select count(*)::int n from pg_policies where schemaname='storage' and policyname like 'home\\_documents%'`) === 0);
  check("down leaves personal data and career-documents policies intact", await count(`select count(*)::int n from public.company_state`) === 6
    && await count(`select count(*)::int n from pg_policies where schemaname='storage' and policyname like 'career\\_documents%'`) === 4);
  await db.exec(up1); await db.exec(up2);
  // 9 מקוריות + company.household.read/write (asaf/household-grocery, Issue #7) = 11.
  check("up again after down works (round trip)", await count(`select count(*)::int n from public.capabilities`) === 11);
  return results;
}
