import assert from "node:assert/strict";
import test from "node:test";

const { visibleCompanySlugs, canViewCompany, isCompanyReadOnly, isHqVisible } = await import("../lib/workspace.js");
const { capabilitiesForTemplate, DEFAULT_PARTNER_TEMPLATE } = await import("../lib/authz/capabilities.js");

// כל החברות ברישום (companies/registry.js) ועוד השלד imun. מזהים בדויים בלבד.
const COMPANIES = ["beit-hadash", "kesef", "health", "avoda", "nefesh", "household", "imun"];
const member = template => ({ mode: "member", userId: "u", isOwner: false, workspaceId: "ws", grants: capabilitiesForTemplate(template), reason: "member" });
const memberWith = (...templates) => ({ mode: "member", userId: "u", isOwner: false, workspaceId: "ws", grants: templates.flatMap(capabilitiesForTemplate), reason: "member" });
const ACCESS = {
  owner: { mode: "member", userId: "u", isOwner: true, workspaceId: "ws", grants: [], reason: "owner" },
  "lior B+ (default)": member(DEFAULT_PARTNER_TEMPLATE),
  "lior B (read-only finance)": member("partner_full_finance"),
  "lior B+ + household": memberWith(DEFAULT_PARTNER_TEMPLATE, "partner_household"),
  // partner_lior (Issue #7, P0): אותו איחוד יכולות כמו "lior B+ + household" למעלה, אבל דרך חבילה
  // מפורשת אחת (אישור יחיד ב-rbac_approve_member) במקום שתי חבילות ברצף. זו החבילה שליאור מחזיקה
  // בפועל בפרודקשן (Amit, Issue #7).
  "lior partner_lior (single template)": member("partner_lior"),
  "shaked designer": member("designer_beit_hadash"),
  "unapproved (no_workspace)": { mode: "restricted", userId: "u", isOwner: false, workspaceId: null, grants: [], reason: "no_workspace" },
  "unavailable": { mode: "restricted", userId: "u", isOwner: false, workspaceId: null, grants: [], reason: "unavailable" },
  "RBAC not enabled (legacy)": { mode: "personal", userId: "u", isOwner: true, workspaceId: null, grants: [], reason: "not_enabled" },
};

// [visible companies, read-only companies among the visible, HQ visible]
// Issue #7 (P0, עמית + לירון, 29.9.2026): הצגה נגזרת אך ורק מהיכולות/ההרשאות בפועל. אין יותר
// "מרחב אישי ריק" לבריאות/קריירה כפרס ניחומים על hq.view — אף member לא רואה חברה אישית
// (health/avoda/nefesh), גם לא כמרחב ריק, גם לא כשיש לו hq.view. ראה docs/rbac/DESIGN.md.
const EXPECTED = {
  owner: [COMPANIES, [], true],
  "lior B+ (default)": [["beit-hadash", "kesef"], [], true],
  "lior B (read-only finance)": [["beit-hadash", "kesef"], ["kesef"], true],
  // household (Issue #7): יכולת עצמאית לגמרי, לא כלולה בשום חבילת כספים — ליאור צריכה partner_household בנפרד.
  "lior B+ + household": [["beit-hadash", "kesef", "household"], [], true],
  "lior partner_lior (single template)": [["beit-hadash", "kesef", "household"], [], true],
  "shaked designer": [["beit-hadash"], [], false],
  "unapproved (no_workspace)": [[], [], false],
  unavailable: [[], [], false],
  "RBAC not enabled (legacy)": [COMPANIES, [], true],
};

for (const [who, [visible, readOnly, hq]] of Object.entries(EXPECTED)) {
  test(`company x user matrix: ${who}`, () => {
    const access = ACCESS[who];
    for (const slug of COMPANIES) assert.equal(canViewCompany(access, slug), visible.includes(slug), `${who} / ${slug} visible`);
    assert.deepEqual(visibleCompanySlugs(access, COMPANIES), visible);
    for (const slug of visible) assert.equal(isCompanyReadOnly(access, slug), readOnly.includes(slug), `${who} / ${slug} read-only`);
    assert.equal(isHqVisible(access), hq);
  });
}

test("Shaked sees nothing but Beit Hadash: no HQ, no finance, no core, no personal companies, no household, no imun", () => {
  const a = ACCESS["shaked designer"];
  assert.deepEqual(visibleCompanySlugs(a, COMPANIES), ["beit-hadash"]);
  assert.equal(isHqVisible(a), false);
  for (const slug of COMPANIES.filter(c => c !== "beit-hadash")) assert.equal(canViewCompany(a, slug), false, slug);
});

test("Lior (partner_lior, Issue #7 P0 exact production grant): sees ONLY beit-hadash, kesef, household and the HQ screen. Health, nefesh, avoda and imun are completely absent — not shown even as an empty personal space", () => {
  const a = ACCESS["lior partner_lior (single template)"];
  assert.deepEqual(visibleCompanySlugs(a, COMPANIES), ["beit-hadash", "kesef", "household"]);
  assert.equal(isHqVisible(a), true);
  for (const slug of ["beit-hadash", "kesef", "household"]) assert.equal(canViewCompany(a, slug), true, slug);
  for (const slug of ["health", "avoda", "nefesh", "imun"]) assert.equal(canViewCompany(a, slug), false, slug);
});

test("Lior without household (B / B+ alone): health, avoda and nefesh are hidden completely — never shown as an empty personal space, regardless of hq.view", () => {
  for (const key of ["lior B+ (default)", "lior B (read-only finance)"]) {
    const a = ACCESS[key];
    assert.equal(isHqVisible(a), true); // hq.view alone no longer implies any personal-company visibility
    for (const slug of ["health", "avoda", "nefesh"]) {
      assert.equal(canViewCompany(a, slug), false, `${key} / ${slug}`);
      assert.equal(visibleCompanySlugs(a, [slug]).includes(slug), false, `${key} / ${slug}`);
    }
    for (const slug of ["beit-hadash", "kesef"]) assert.equal(canViewCompany(a, slug), true, `${key} / ${slug}`);
  }
});

test("household (משק בית, Issue #7): owner always full access; Lior needs partner_household explicitly (her finance package alone is not enough); Shaked never sees it", () => {
  const owner = ACCESS.owner;
  assert.equal(canViewCompany(owner, "household"), true);
  assert.equal(isCompanyReadOnly(owner, "household"), false);

  for (const key of ["lior B+ (default)", "lior B (read-only finance)"]) {
    assert.equal(canViewCompany(ACCESS[key], "household"), false, key);
  }
  const liorWithHousehold = ACCESS["lior B+ + household"];
  assert.equal(canViewCompany(liorWithHousehold, "household"), true);
  assert.equal(isCompanyReadOnly(liorWithHousehold, "household"), false); // partner_household כולל write

  const shaked = ACCESS["shaked designer"];
  assert.equal(canViewCompany(shaked, "household"), false);
  assert.equal(visibleCompanySlugs(shaked, COMPANIES).includes("household"), false);
});

test("partner_lior (Issue #7, P0): one explicit composite template grants exactly the union of partner_full_finance_edit + partner_household, in a single approve_member call", () => {
  const single = ACCESS["lior partner_lior (single template)"];
  const composite = ACCESS["lior B+ + household"];

  // אותה תוצאה בדיוק כמו שתי חבילות ברצף (רק שם הענקה בשתי החבילות, "hq.view", מופיע פעמיים כשמצרפים אותן — מכאן ה-dedup):
  // בית חדש (עריכה), כספים דשבורד+תנועות (עריכה), משק בית (עריכה), ליבה קריאה בלבד, HQ.
  assert.deepEqual([...capabilitiesForTemplate("partner_lior")].sort(), [...new Set(composite.grants)].sort());
  for (const slug of ["beit-hadash", "kesef", "household"]) {
    assert.equal(canViewCompany(single, slug), true, slug);
    assert.equal(isCompanyReadOnly(single, slug), isCompanyReadOnly(composite, slug), slug);
  }
  assert.equal(canViewCompany(single, "nefesh"), false); // לעולם לא, גם עם החבילה המאוחדת
  assert.deepEqual(visibleCompanySlugs(single, COMPANIES).sort(), visibleCompanySlugs(composite, COMPANIES).sort());
  assert.equal(isHqVisible(single), true);

  // בריאות וקריירה שלה מוסתרות לחלוטין (Issue #7, P0) — לא מרחב ריק, לא שום דבר אחר, גם עם partner_lior.
  for (const slug of ["health", "avoda"]) {
    assert.equal(canViewCompany(single, slug), false, slug);
    assert.equal(canViewCompany(composite, slug), false, slug);
  }

  // שקד לא מקבלת שום דבר מ-partner_lior, בשום נסיבות.
  const shaked = ACCESS["shaked designer"];
  for (const cap of capabilitiesForTemplate("partner_lior")) {
    assert.equal(capabilitiesForTemplate("designer_beit_hadash").includes(cap), cap === "company.beit-hadash.read" || cap === "company.beit-hadash.write", cap);
  }
  assert.equal(canViewCompany(shaked, "household"), false);
  assert.equal(canViewCompany(shaked, "kesef"), false);
  assert.equal(isHqVisible(shaked), false);
});

// Issue #7, P0: מטריצת האמת המדויקת של עמית, כפי שאושרה מול ההרשאות בפועל ב-production.
// AccessGate (app/companies/AccessGate.jsx) קורא ל-canViewCompany בדיוק כמו הניווט (CompanyNavigator)
// ומסך הבית (MemberHome/page.jsx) — זה אותו מקור אמת יחיד, כך שחסימת ניווט ישיר (URL) וחסימת הצגה
// בניווט הן אותה בדיקה בדיוק, לא שתי מנגנונים נפרדים. AccessGate הוא client component שלא מרנדר את
// children (תוכן החברה) עד ש-ready===true וה-slug עבר את canViewCompany — כך שגם בטעינה ישירה של
// /companies/<slug> (לא ניווט מבפנים) לא נחשף תוכן לפני שהיכולות אומתו. הבדיקה כאן מכסה את השכבה
// הזו (הפונקציה הטהורה); אימות שה-URL בפועל בדפדפן מציג את מסך החסימה ולא את תוכן החברה בוצע בנפרד
// (ראו תיאור ה-PR — mcp__Claude_Browser__* עם גישה מדומה של ליאור/שקד).
test("Issue #7 P0 exact matrix: Lior sees exactly {beit-hadash, kesef, household, HQ}; Shaked sees exactly {beit-hadash}, no HQ; a stranger/unapproved user sees nothing", () => {
  const lior = ACCESS["lior partner_lior (single template)"];
  const shaked = ACCESS["shaked designer"];
  const stranger = ACCESS["unapproved (no_workspace)"];

  assert.deepEqual(visibleCompanySlugs(lior, COMPANIES).sort(), ["beit-hadash", "household", "kesef"]);
  assert.equal(isHqVisible(lior), true);

  assert.deepEqual(visibleCompanySlugs(shaked, COMPANIES), ["beit-hadash"]);
  assert.equal(isHqVisible(shaked), false);

  assert.deepEqual(visibleCompanySlugs(stranger, COMPANIES), []);
  assert.equal(isHqVisible(stranger), false);
});
