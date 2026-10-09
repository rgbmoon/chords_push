import { expect, it } from "vitest";
import { count, formatDate, timeAgo } from "./format";

it("подписи времени и количества", () => {
  const now = new Date(2026, 9, 9, 12).getTime();
  expect(count(1, "chord", "chords")).toBe("1 chord");
  expect(count(2, "chord", "chords")).toBe("2 chords");
  expect(timeAgo(now - 10_000, now)).toBe("just now");
  expect(timeAgo(now - 5 * 60_000, now)).toBe("5 minutes ago");
  expect(timeAgo(now - 3600_000, now)).toBe("1 hour ago");
  expect(timeAgo(now - 2 * 86400_000, now)).toBe("2 days ago");
  expect(timeAgo(new Date(2026, 0, 2).getTime(), now)).toBe("2026-01-02");
  expect(formatDate(now)).toBe("2026-10-09");
});
