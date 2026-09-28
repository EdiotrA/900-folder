// Automated End-to-End Test Suite for PlayVault Arcade
import assert from 'assert';

const BASE = 'http://localhost:3000';

function extractCookie(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(';')[0];
}

async function runTests() {
  console.log('--- Starting PlayVault Automated Test Suite ---');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`✕ FAIL: ${name} ->`, e.message);
      failed++;
    }
  }

  // 1. Health & Config
  await test('Server Health Check', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
  });

  // 2. Games API (200+ Games Catalog)
  await test('Game Catalog retrieval (200+ games)', async () => {
    const res = await fetch(`${BASE}/api/games?limit=300`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(data.games.length >= 200, `Expected >= 200 games, got ${data.games.length}`);
    const bonk = data.games.find((g) => g.slug === 'bonk-io-local');
    assert(bonk, 'Bonk.io should be in games catalog');
  });

  await test('Game Search & Category Filtering', async () => {
    const searchRes = await fetch(`${BASE}/api/games?q=slope`);
    const searchData = await searchRes.json();
    assert(searchData.games.length > 0, 'Search for "slope" should return results');

    const catRes = await fetch(`${BASE}/api/games?category=action`);
    const catData = await catRes.json();
    assert(catData.games.length > 0, 'Category "action" should return games');
  });

  // 3. Admin Security & Authentication
  let adminCookie = '';
  await test('Admin unauthorized access blocked (401)', async () => {
    const res = await fetch(`${BASE}/api/admin/overview`);
    assert.strictEqual(res.status, 401);
  });

  await test('Admin login with incorrect password blocked (401)', async () => {
    const res = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrongpassword' }),
    });
    assert.strictEqual(res.status, 401);
  });

  await test('Admin login with correct password succeeds', async () => {
    const res = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'AdminPlayVault2026!' }),
    });
    assert.strictEqual(res.status, 200);
    adminCookie = extractCookie(res);
    assert(adminCookie.includes('playvault.sid'), 'Should return session cookie');
  });

  await test('Admin dashboard access with session cookie', async () => {
    const res = await fetch(`${BASE}/api/admin/overview`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(data.stats.totalGames >= 200);
  });

  await test('Admin audit logs recorded', async () => {
    const res = await fetch(`${BASE}/api/admin/logs`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(data.logs.length > 0, 'Audit logs should contain admin_login event');
  });

  // 4. User Authentication, Favorites & Recently Played
  let userCookie = '';
  let testUserId = '';
  await test('User demo/Google sign-in and session persistence', async () => {
    const res = await fetch(`${BASE}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test_player_2026@gmail.com', displayName: 'Test Gamer' }),
    });
    assert.strictEqual(res.status, 200);
    userCookie = extractCookie(res);
    const data = await res.json();
    testUserId = data.user.id;
    assert.strictEqual(data.user.email, 'test_player_2026@gmail.com');

    // Verify session persistence via /api/auth/me
    const meRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { Cookie: userCookie },
    });
    const meData = await meRes.json();
    assert.strictEqual(meData.user.id, testUserId);
  });

  let sampleGameId = '';
  await test('User favorites workflow', async () => {
    const gamesRes = await fetch(`${BASE}/api/games?limit=1`);
    const gamesData = await gamesRes.json();
    sampleGameId = gamesData.games[0].id;

    // Add favorite
    const addRes = await fetch(`${BASE}/api/me/favorites/${sampleGameId}`, {
      method: 'POST',
      headers: { Cookie: userCookie },
    });
    assert.strictEqual(addRes.status, 200);

    // List favorites
    const listRes = await fetch(`${BASE}/api/me/favorites`, {
      headers: { Cookie: userCookie },
    });
    const listData = await listRes.json();
    assert(listData.games.some((g) => g.id === sampleGameId), 'Game should appear in favorites');

    // Remove favorite
    const delRes = await fetch(`${BASE}/api/me/favorites/${sampleGameId}`, {
      method: 'DELETE',
      headers: { Cookie: userCookie },
    });
    assert.strictEqual(delRes.status, 200);
  });

  await test('User recently played workflow', async () => {
    // Play Bonk.io
    const playRes = await fetch(`${BASE}/api/games/bonk-io-local/play`, {
      method: 'POST',
      headers: { Cookie: userCookie },
    });
    assert.strictEqual(playRes.status, 200);

    const recRes = await fetch(`${BASE}/api/me/recent`, {
      headers: { Cookie: userCookie },
    });
    const recData = await recRes.json();
    assert(recData.games.some((g) => g.slug === 'bonk-io-local'), 'Bonk.io should be in recently played');
  });

  await test('Broken game reporting workflow (Requirement 36)', async () => {
    const reportRes = await fetch(`${BASE}/api/games/bonk-io-local/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({ reason: 'load', details: 'Automated test report' }),
    });
    assert.strictEqual(reportRes.status, 200);

    // Admin should see report
    const adminRepRes = await fetch(`${BASE}/api/admin/reports`, {
      headers: { Cookie: adminCookie },
    });
    const adminRepData = await adminRepRes.json();
    assert(adminRepData.reports.some((r) => r.reason === 'load'), 'Report should be visible to admin');
  });

  // 5. Banning and Moderation Workflow (Requirement 23, 24, 27)
  await test('User Banning & Access Revocation', async () => {
    // Admin bans user
    const banRes = await fetch(`${BASE}/api/admin/users/${testUserId}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ reason: 'Automated TOS Violation Test', duration: '7d' }),
    });
    assert.strictEqual(banRes.status, 200);

    // Banned user tries to access /api/auth/me -> 403 Forbidden
    const meRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { Cookie: userCookie },
    });
    assert.strictEqual(meRes.status, 403);
    const meData = await meRes.json();
    assert.strictEqual(meData.banReason, 'Automated TOS Violation Test');

    // Banned user tries to login again -> 403 Forbidden
    const loginRes = await fetch(`${BASE}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test_player_2026@gmail.com' }),
    });
    assert.strictEqual(loginRes.status, 403);
  });

  await test('User Unbanning & Access Restoration', async () => {
    // Admin unbans user
    const unbanRes = await fetch(`${BASE}/api/admin/users/${testUserId}/unban`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(unbanRes.status, 200);

    // User can login again
    const loginRes = await fetch(`${BASE}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test_player_2026@gmail.com' }),
    });
    assert.strictEqual(loginRes.status, 200);
  });

  // 6. Admin Logout
  await test('Admin logout invalidates session', async () => {
    const logoutRes = await fetch(`${BASE}/api/admin/logout`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(logoutRes.status, 200);

    // Subsequent admin requests rejected with 401
    const checkRes = await fetch(`${BASE}/api/admin/overview`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(checkRes.status, 401);
  });

  // 7. Static Assets & Bonk.io Preservation
  await test('Bonk.io standalone player preserved (/bonk.html)', async () => {
    const res = await fetch(`${BASE}/bonk.html`);
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert(text.includes('id="bonkFrame"'), 'Should contain bonk frame');
    assert(text.includes('src="https://bonk.io"'), 'Should point to bonk.io');
    assert(text.includes('anti-redirect') || text.includes('Protected'), 'Should include protection');
  });

  await test('Main Index HTML contains solid black calculator gate', async () => {
    const res = await fetch(`${BASE}/`);
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert(text.includes('id="calcGate"'), 'Should have calcGate');
    assert(text.includes('id="calcDisplay"'), 'Should have calculator display');
    assert(text.includes('id="calcNotes"'), 'Should have school notes');
    assert(text.includes('id="platformRoot"'), 'Should have platform root');
  });

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);
  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
