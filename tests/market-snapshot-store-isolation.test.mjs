import { test } from 'node:test';
import assert from 'node:assert/strict';

// lib/store.js טוענת את lib/supabase.js בזמן import, שדורש URL/anon key תקינים
// כדי לא ליפול מיד — ראו אותה הערה ב-tests/store-sync.test.mjs.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://placeholder.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'placeholder-anon-key';

const { loadWithClient, saveWithClient } = await import('../lib/store.js');
const { STORE_KEY, buildSnapshot } = await import('../companies/kesef/market-snapshot.js');

// מדמה טבלת company_state משותפת (כמו Supabase אמיתי), עם RLS "אמיתי" בכך
// שכל לקוח מזויף קשור מראש למשתמש שלו — בדיוק כמו auth.getSession() אמיתי.
function sharedTable() { return new Map(); } // `${user_id}:${company_key}` -> data
function fakeClientFor(userId, table) {
  return {
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }) },
    from: () => {
      const filters = {};
      return {
        select: () => ({
          eq: (col, val) => { filters[col] = val; return {
            eq: (col2, val2) => { filters[col2] = val2; return {
              maybeSingle: async () => {
                const row = table.get(`${filters.user_id}:${filters.company_key}`);
                return { data: row ? { data: row } : null, error: null };
              },
            }; },
          }; },
        }),
        upsert: async row => { table.set(`${row.user_id}:${row.company_key}`, row.data); return { error: null }; },
      };
    },
  };
}

const historyFor = symbol => ({ symbol: `${symbol}.US`, fetchedAt: '2026-09-21T12:00:00.000Z', bars: [{ date: '2026-09-18', close: 42, volume: 1 }] });

test('a saved market snapshot is isolated per user: a second user never sees the first user’s data', async () => {
  const table = sharedTable();
  const userA = fakeClientFor('user-a', table);
  const userB = fakeClientFor('user-b', table);

  const saveResult = await saveWithClient(userA, STORE_KEY, buildSnapshot(historyFor('AAPL')));
  assert.equal(saveResult.synced, true);

  const loadedByOwner = await loadWithClient(userA, STORE_KEY);
  assert.equal(loadedByOwner.symbol, 'AAPL.US');

  const loadedByOther = await loadWithClient(userB, STORE_KEY);
  assert.equal(loadedByOther, null, 'a different authenticated user must not receive the first user’s snapshot');
});

test('two users can each save their own snapshot under the same store key without clobbering each other', async () => {
  const table = sharedTable();
  const userA = fakeClientFor('user-a', table);
  const userB = fakeClientFor('user-b', table);

  await saveWithClient(userA, STORE_KEY, buildSnapshot(historyFor('AAPL')));
  await saveWithClient(userB, STORE_KEY, buildSnapshot(historyFor('MSFT')));

  assert.equal((await loadWithClient(userA, STORE_KEY)).symbol, 'AAPL.US');
  assert.equal((await loadWithClient(userB, STORE_KEY)).symbol, 'MSFT.US');
});

test('without a session, snapshots stay local-only and are never uploaded to a shared row', async () => {
  const table = sharedTable();
  const anonymous = fakeClientFor(null, table);
  const result = await saveWithClient(anonymous, STORE_KEY, buildSnapshot(historyFor('AAPL')));
  assert.deepEqual(result, { synced: false, reason: 'no-session' });
  assert.equal(table.size, 0);
});
