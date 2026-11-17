import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  duration: '10s',
};

export function setup() {
  const res = http.get('http://localhost:3000/api/v1/tenants/slug/radha-beauty-salon');
  if (res.status === 200) {
    try {
      const data = JSON.parse(res.body);
      const service = data.services && data.services[0];
      return {
        tenantId: data.id,
        serviceId: service ? service.id : null,
      };
    } catch (e) {}
  }
  return {
    tenantId: __ENV.TENANT_ID || '00000000-0000-0000-0000-000000000000',
    serviceId: __ENV.SERVICE_ID || '00000000-0000-0000-0000-000000000000',
  };
}

export default function (data) {
  // Test concurrent slot lock for tomorrow 11:00 AM
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  tomorrow.setHours(11, 0, 0, 0);

  const res = http.post(
    'http://localhost:3000/api/v1/bookings/hold',
    JSON.stringify({
      tenantId: data.tenantId,
      serviceId: data.serviceId,
      startTime: tomorrow.toISOString(),
      customerEmail: `test${__VU}@example.com`,
      customerName: `User ${__VU}`,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(res, {
    'status is 201 (acquired) or 409 (locked)': (r) => r.status === 201 || r.status === 409,
  });
}
