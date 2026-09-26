import assert from "node:assert/strict";
import test from "node:test";

const { visibleCompanySlugs, canViewCompany, isCompanyReadOnly, isHqVisible } = await import("../lib/workspace.js");
const { capabilitiesForTemplate, DEFAULT_PARTNER_TEMPLATE } = await import("../lib/authz/capabilities.js");

// כל החברות ברישום (companies/registry.js) ועוד השלד imun. מזהים בדויים בלבד.
const COMPANIES = ["beit-hadash", "kesef", "health", "avoda", "nefesh", "imun"];
const member = template => ({ mode: "member", userId: "u", isOwner: false, workspaceId: "ws", grants: capabilitiesForTemplate(template), reason: "member" });
const ACCESS = {
  owner: { mode: "member", userId: "u", isOwner: true, workspaceId: "ws", grants: [], reason: "owner" },
  "lior B+ (default)": member(DEFAULT_PARTNER_TEMPLATE),
  "lior B (read-only finance)": member("partner_full_finance"),
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
