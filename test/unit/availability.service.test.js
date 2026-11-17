require("dotenv").config();
const prisma = require("../../src/utils/prisma.client");
const availabilityService = require("../../src/services/availability.service");

describe("AvailabilityService Unit Tests", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return empty array when date is a declared holiday", async () => {
    jest.spyOn(prisma.tenant, "findUniqueOrThrow").mockResolvedValue({
      id: "t1",
      timezone: "Asia/Kolkata",
      holidays: [{ date: new Date("2026-12-25"), reason: "Christmas" }],
      businessHours: [],
    });

    const slots = await availabilityService.getSlots("t1", "s1", "2026-12-25");
    expect(slots).toEqual([]);
  });

  it("should return empty array when business is closed on that day of week", async () => {
    jest.spyOn(prisma.tenant, "findUniqueOrThrow").mockResolvedValue({
      id: "t1",
      timezone: "Asia/Kolkata",
      holidays: [],
      businessHours: [
        { dayOfWeek: 0, isOpen: false, openTime: "09:00", closeTime: "18:00" }, // Sunday closed
      ],
    });

    // 2026-11-22 is Sunday
    const slots = await availabilityService.getSlots("t1", "s1", "2026-11-22");
    expect(slots).toEqual([]);
  });
});
