const {
  formatTime12,
  formatDate12,
  formatDateTime12,
  formatTimeRange12,
} = require("../../src/utils/datetime.utils");

describe("DateTime Utils (12-hour AM/PM)", () => {
  it("formats 24-hour time strings into 12-hour AM/PM", () => {
    expect(formatTime12("09:00")).toBe("09:00 AM");
    expect(formatTime12("12:00")).toBe("12:00 PM");
    expect(formatTime12("13:45")).toBe("01:45 PM");
    expect(formatTime12("19:00")).toBe("07:00 PM");
    expect(formatTime12("00:15")).toBe("12:15 AM");
  });

  it("formats time ranges correctly", () => {
    expect(formatTimeRange12("09:00", "19:00")).toBe("09:00 AM – 07:00 PM");
    expect(formatTimeRange12("10:30", "16:00")).toBe("10:30 AM – 04:00 PM");
  });

  it("handles null/undefined gracefully", () => {
    expect(formatTime12(null)).toBe("—");
    expect(formatDate12(undefined)).toBe("—");
    expect(formatDateTime12("")).toBe("—");
  });

  it("formats Date objects with 12-hour AM/PM", () => {
    const d = new Date("2026-11-18T14:30:00.000Z");
    const formatted = formatDateTime12(d);
    expect(formatted).toMatch(/(AM|PM)/);
  });
});
