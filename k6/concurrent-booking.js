import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
};

export default function () {
  const res = http.post(
    'http://localhost:3000/api/v1/bookings/hold',
    JSON.stringify({
      tenantId: 'YOUR_TENANT_ID',
      serviceId: 'YOUR_SERVICE_ID',
      staffId: 'YOUR_STAFF_ID',
      startTime: '2024-12-01T10:00:00Z',
      customerEmail: `test${__VU}@example.com`,
      customerName: 'Test User',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(res, {
    'status is 200 or 409': (r) => r.status === 200 || r.status === 409,
  });
}

// Expected: exactly 1 success (200), 49 failures (409) for same slot
// Run with: k6 run k6/concurrent-booking.js
