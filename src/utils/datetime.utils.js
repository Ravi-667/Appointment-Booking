/**
 * Central Date & Time Formatting Utilities for 12-Hour AM/PM representation
 */

function formatTime12(time) {
  if (!time) return "—";
  if (typeof time === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(time)) {
    const [h, m] = time.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
  }
  const date = new Date(time);
  if (isNaN(date.getTime())) return String(time);
  return date
    .toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
}

function formatDate12(dateVal) {
  if (!dateVal) return "—";
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return String(dateVal);
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime12(dateTime) {
  if (!dateTime) return "—";
  const date = new Date(dateTime);
  if (isNaN(date.getTime())) return String(dateTime);
  return date
    .toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

function formatTimeRange12(openTime, closeTime) {
  if (!openTime || !closeTime) return "—";
  return `${formatTime12(openTime)} – ${formatTime12(closeTime)}`;
}

module.exports = {
  formatTime12,
  formatDate12,
  formatDateTime12,
  formatTimeRange12,
};
