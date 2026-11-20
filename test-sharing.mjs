// Comprehensive local automated verification for Mode 3 & Channel Sharing
const BASE = 'http://127.0.0.1:8787';

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function runTests() {
  console.log('🚀 Starting Mode 3 & Channel Sharing Test Suite...\n');

  // 1. User Alice Login
  const loginAlice = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'alice', nickname: 'Alice' }),
  });
  assert(loginAlice.ok && loginAlice.data.user.username === 'alice', 'User Alice login successful');
  const aliceToken = loginAlice.data.token;
  const aliceAuth = { Authorization: `Bearer ${aliceToken}` };

  // 2. Alice creates a new bin
  const createBinRes = await request('/api/bins', {
    method: 'POST',
    headers: aliceAuth,
    body: JSON.stringify({ name: 'Alice Test Channel' }),
  });
  assert(createBinRes.ok && createBinRes.data.bin.id, 'Alice created bin successfully');
  const bin = createBinRes.data.bin;
  const binId = bin.id;
  const shareToken = bin.share_token;
  assert(bin.role === 'owner', 'Alice has role "owner" on her bin');
  assert(typeof shareToken === 'string' && shareToken.startsWith('st_'), 'Bin has valid share_token generated');

  // 3. User Alice lists bins
  const aliceBinsRes = await request('/api/bins', { headers: aliceAuth });
  assert(aliceBinsRes.ok, 'Alice fetched bins successfully');
  assert(aliceBinsRes.data.myBins.some(b => b.id === binId), 'Created bin appears in myBins');

  // 4. Send Webhook payload to /bin/:binId (unauthenticated incoming webhook)
  const webhookRes = await fetch(`${BASE}/bin/${binId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'TestClient/1.0' },
    body: JSON.stringify({ event: 'order.completed', amount: 99.9 }),
  });
  assert(webhookRes.status === 200, 'Incoming webhook received with 200 OK');

  // Wait 100ms for async D1 save
  await new Promise(r => setTimeout(r, 200));

  // 5. Alice inspects requests
  const requestsRes = await request(`/api/bins/${binId}/requests`, { headers: aliceAuth });
  assert(requestsRes.ok && requestsRes.data.requests.length >= 1, 'Webhook request saved and listed by owner');
  const reqItem = requestsRes.data.requests[0];
  assert(reqItem.body.includes('order.completed'), 'Webhook body parsed correctly');

  // 6. User Bob Login
  const loginBob = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'bob', nickname: 'Bob' }),
  });
  assert(loginBob.ok && loginBob.data.user.username === 'bob', 'User Bob login successful');
  const bobToken = loginBob.data.token;
  const bobAuth = { Authorization: `Bearer ${bobToken}` };

  // 7. Bob attempts unauthorized access to Alice's bin
  const bobUnauthorizedGet = await request(`/api/bins/${binId}`, { headers: bobAuth });
  assert(bobUnauthorizedGet.status === 403, 'Bob is blocked (403) from accessing Alice\'s private bin');

  // 8. Bob joins Alice's bin using Share Token
  const joinRes = await request('/api/bins/join-by-share', {
    method: 'POST',
    headers: bobAuth,
    body: JSON.stringify({ shareToken }),
  });
  assert(joinRes.ok && joinRes.data.bin.id === binId, 'Bob successfully joined Alice\'s bin via shareToken');
  assert(joinRes.data.bin.role === 'viewer', 'Bob has "viewer" role after joining via link');

  // 9. Bob lists bins (Alice's bin must appear in sharedBins)
  const bobBinsRes = await request('/api/bins', { headers: bobAuth });
  assert(bobBinsRes.ok, 'Bob fetched bins');
  assert(bobBinsRes.data.sharedBins.some(b => b.id === binId), 'Alice\'s bin appears in Bob\'s sharedBins');

  // 10. Bob (viewer) tries to edit Alice's bin configuration (MUST FAIL)
  const bobEditRes = await request(`/api/bins/${binId}`, {
    method: 'PUT',
    headers: bobAuth,
    body: JSON.stringify({ name: 'Hacked Name' }),
  });
  assert(bobEditRes.status === 403, 'Bob (viewer) is blocked (403) from updating bin settings');

  // 11. Bob (viewer) tries to clear requests (MUST FAIL)
  const bobClearRes = await request(`/api/bins/${binId}/requests`, {
    method: 'DELETE',
    headers: bobAuth,
  });
  assert(bobClearRes.status === 403, 'Bob (viewer) is blocked (403) from clearing requests');

  // 12. Bob (viewer) tries to delete bin (MUST FAIL)
  const bobDeleteBinRes = await request(`/api/bins/${binId}`, {
    method: 'DELETE',
    headers: bobAuth,
  });
  assert(bobDeleteBinRes.status === 403, 'Bob (viewer) is blocked (403) from deleting bin');

  // 13. Alice upgrades Bob to "editor" via Member Management API
  const addEditorRes = await request(`/api/bins/${binId}/members`, {
    method: 'POST',
    headers: aliceAuth,
    body: JSON.stringify({ username: 'bob', role: 'editor' }),
  });
  assert(addEditorRes.ok, 'Alice upgraded Bob to "editor" member');

  // 14. Check member list
  const membersRes = await request(`/api/bins/${binId}/members`, { headers: aliceAuth });
  assert(membersRes.ok && membersRes.data.members.length === 2, 'Member list returns 2 members');
  const bobMember = membersRes.data.members.find(m => m.username === 'bob');
  assert(bobMember && bobMember.role === 'editor', 'Bob has editor role in member list');

  // 15. Bob (now editor) updates bin response configuration (MUST SUCCEED)
  const bobEditSuccessRes = await request(`/api/bins/${binId}`, {
    method: 'PUT',
    headers: bobAuth,
    body: JSON.stringify({
      name: 'Alice & Bob Co-working Channel',
      response_status: 201,
      response_body: '{"status":"created"}',
    }),
  });
  assert(bobEditSuccessRes.ok, 'Bob (editor) successfully updated bin settings');
  assert(bobEditSuccessRes.data.bin.name === 'Alice & Bob Co-working Channel', 'Bin name updated to Alice & Bob Co-working Channel');

  // Test webhook with new mock response: status should now be 201
  const testUpdatedWebhook = await fetch(`${BASE}/bin/${binId}`);
  assert(testUpdatedWebhook.status === 201, 'Incoming webhook returns updated mock status 201');

  // 16. Alice resets share token
  const resetTokenRes = await request(`/api/bins/${binId}/reset-share-token`, {
    method: 'POST',
    headers: aliceAuth,
  });
  assert(resetTokenRes.ok && resetTokenRes.data.share_token !== shareToken, 'Alice successfully reset share token');

  // Old share token should now fail for joining
  const charlieLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'charlie' }),
  });
  const charlieAuth = { Authorization: `Bearer ${charlieLogin.data.token}` };
  const joinWithOldToken = await request('/api/bins/join-by-share', {
    method: 'POST',
    headers: charlieAuth,
    body: JSON.stringify({ shareToken }),
  });
  assert(joinWithOldToken.status === 404, 'Old share token is rejected (404)');

  // 17. Alice removes Bob from members
  const removeBobRes = await request(`/api/bins/${binId}/members/usr_bob`, {
    method: 'DELETE',
    headers: aliceAuth,
  });
  assert(removeBobRes.ok, 'Alice removed Bob from channel members');

  // 18. Alice deletes the bin
  const deleteBinRes = await request(`/api/bins/${binId}`, {
    method: 'DELETE',
    headers: aliceAuth,
  });
  assert(deleteBinRes.ok, 'Alice successfully deleted bin');

  // Requests should be gone
  const verifyDeleteRes = await request(`/api/bins/${binId}`, { headers: aliceAuth });
  assert(verifyDeleteRes.status === 404 || verifyDeleteRes.data?.bin?.id !== binId, 'Bin confirmed deleted');

  console.log('\n🎉 ALL 18 TESTS PASSED SUCCESSFULLY! Local verification complete.');
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

