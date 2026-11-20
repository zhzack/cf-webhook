// Test Outbound API Client /api/send
const BASE = 'http://127.0.0.1:8787';

async function run() {
  console.log('Testing /api/send endpoint...');

  // 1. Dev login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'tester' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('✅ Logged in as tester');

  // 2. Test GET via /api/send
  const sendGetRes = await fetch(`${BASE}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: `${BASE}/api/health`,
      method: 'GET',
    }),
  });
  const sendGetData = await sendGetRes.json();
  if (!sendGetData.success || sendGetData.status !== 200) {
    throw new Error('GET /api/health failed');
  }
  console.log(`✅ Outbound GET test passed (${sendGetData.durationMs}ms, status: ${sendGetData.status})`);

  // 3. Test POST with custom headers and JSON body to /bin/test_outbound
  const sendPostRes = await fetch(`${BASE}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: `${BASE}/bin/test_outbound/events`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Client': 'Network-Debugger-Outbound',
      },
      queryParams: {
        env: 'test',
        version: '1',
      },
      body: JSON.stringify({
        action: 'api_client_test',
        value: 42,
      }),
    }),
  });
  const sendPostData = await sendPostRes.json();
  console.log('POST /bin/test_outbound result:', sendPostData);
  if (!sendPostData.success || sendPostData.status !== 200) {
    throw new Error('POST /bin/test_outbound failed');
  }
  console.log(`✅ Outbound POST test passed (${sendPostData.durationMs}ms, status: ${sendPostData.status})`);

  // 4. Test Error handling with invalid URL
  const sendErrRes = await fetch(`${BASE}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: '',
      method: 'GET',
    }),
  });
  const sendErrData = await sendErrRes.json();
  if (sendErrRes.status !== 400 || sendErrData.success !== false) {
    throw new Error('Invalid URL validation failed');
  }
  console.log(`✅ Validation error handled correctly (HTTP 400: ${sendErrData.error})`);

  console.log('\n🎉 ALL /api/send OUTBOUND PROXY TESTS PASSED!');
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
