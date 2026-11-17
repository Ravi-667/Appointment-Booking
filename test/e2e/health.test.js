const request = require("supertest");
const app = require("../../src/app");

describe("Health Check API", () => {
  it("GET /api/v1/health should return status ok", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("timestamp");
  });

  it("GET /non-existent-route should return 404", async () => {
    const res = await request(app).get("/api/v1/non-existent-route");
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty("statusCode", 404);
  });
});
