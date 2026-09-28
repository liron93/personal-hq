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
  // מפורשת אחת (אישור יחיד ב-rbac_approve_member) במקום שתי חבילות ברצף.
  "lior partner_lior (single template)": member("partner_lior"),
  "shaked designer": member("designer_beit_hadash"),
  "unapproved (no_workspace)": { mode: "restricted", userId: "u", isOwner: false, workspaceId: null, grants: [], reason: "no_workspace" },
  "unavailable": { mode: "restricted", userId: "u", isOwner: false, workspaceId: null, grants: [], reason: "unavailable" },
  "RBAC not enabled (legacy)": { mode: "personal", userId: "u", isOwner: true, workspaceId: null, grants: [], reason: "not_enabled" },
};

// [visible companies, read-only companies among the visible, HQ visible]
const EXPECTED = {
  owner: [COMPANIES, [], true],
  "lior B+ (default)": [["beit-hadash", "kesef", "health", "avoda"], [], true],
  "lior B (read-only finance)": [["beit-hadash", "kesef", "health", "avoda"], ["kesef"], true],
  // household (Issue #7): יכולת עצמאית לגמרי, לא כלולה בשום חבילת כספים — ליאור צריכה partner_household בנפרד.
  "lior B+ + household": [["beit-hadash", "kesef", "health", "avoda", "household"], [], true],
  "lior partner_lior (single template)": [["beit-hadash", "kesef", "health", "avoda", "household"], [], true],
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

test("Shaked sees nothing but Beit Hadash: no HQ, no finance, no core, no personal companies, no imun", () => {
  const a = ACCESS["shaked designer"];
  assert.deepEqual(visibleCompanySlugs(a, COMPANIES), ["beit-hadash"]);
  assert.equal(isHqVisible(a), false);
  for (const slug of COMPANIES.filter(c => c !== "beit-hadash")) assert.equal(canViewCompany(a, slug), false, slug);
});

test("Lior sees everything in the registry except nefesh (Uria), which is hidden completely", () => {
  for (const key of ["lior B+ (default)", "lior B (read-only finance)"]) {
    const a = ACCESS[key];
    assert.equal(canViewCompany(a, "nefesh"), false);
    assert.equal(visibleCompanySlugs(a, ["beit-hadash", "kesef", "health", "avoda", "nefesh"]).includes("nefesh"), false);
    for (const slug of ["beit-hadash", "kesef", "health", "avoda"]) assert.equal(canViewCompany(a, slug), true, slug);
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
  for (const slug of ["beit-hadash", "kesef", "health", "avoda", "household"]) {
    assert.equal(canViewCompany(single, slug), true, slug);
    assert.equal(isCompanyReadOnly(single, slug), isCompanyReadOnly(composite, slug), slug);
  }
  assert.equal(canViewCompany(single, "nefesh"), false); // לעולם לא, גם עם החבילה המאוחדת
  assert.deepEqual(visibleCompanySlugs(single, COMPANIES).sort(), visibleCompanySlugs(composite, COMPANIES).sort());
  assert.equal(isHqVisible(single), true);

  // ה"בריאות" וה"עבודה" שלה נשארות מרחב אישי ריק משלה, כמו בחבילת B+ הרגילה — לא של לירון, ולא משהו נוסף שקיבלה מ-partner_lior.
  for (const slug of ["health", "avoda"]) assert.equal(isCompanyReadOnly(single, slug), false, slug);

  // שקד לא מקבלת שום דבר מ-partner_lior, בשום נסיבות.
  const shaked = ACCESS["shaked designer"];
  for (const cap of capabilitiesForTemplate("partner_lior")) {
    assert.equal(capabilitiesForTemplate("designer_beit_hadash").includes(cap), cap === "company.beit-hadash.read" || cap === "company.beit-hadash.write", cap);
  }
  assert.equal(canViewCompany(shaked, "household"), false);
  assert.equal(canViewCompany(shaked, "kesef"), false);
  assert.equal(isHqVisible(shaked), false);
});
