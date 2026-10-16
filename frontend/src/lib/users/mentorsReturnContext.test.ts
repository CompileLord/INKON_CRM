import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSavedMentorsReturnContext,
  getSavedMentorsReturnContext,
  recordMentorsNavigation,
  restoreMentorsScrollAndFocus,
  validateAndSanitizeMentorsSearch,
} from "./returnContext";

describe("mentors returnContext", () => {
  beforeEach(() => {
    clearSavedMentorsReturnContext();
  });

  it("sanitizes mentors search parameters correctly", () => {
    const result = validateAndSanitizeMentorsSearch("?q=alisher&page=2&pageSize=50&extra=123");
    expect(result.query).toBe("alisher");
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
    expect(result.searchString).toBe("?q=alisher&page=2&pageSize=50");
  });

  it("handles empty or default query parameters", () => {
    const result = validateAndSanitizeMentorsSearch("");
    expect(result.query).toBe("");
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.searchString).toBe("");
  });

  it("records navigation and retrieves saved context for matching role and user", () => {
    recordMentorsNavigation({
      query: "Dilshod",
      page: 2,
      pageSize: 50,
      scrollY: 180,
      mentorId: 42,
      role: "superadmin",
      userId: 1,
    });

    const ctx = getSavedMentorsReturnContext("superadmin", 1);
    expect(ctx).not.toBeNull();
    expect(ctx?.pathname).toBe("/mentors");
    expect(ctx?.query).toBe("Dilshod");
    expect(ctx?.page).toBe(2);
    expect(ctx?.pageSize).toBe(50);
    expect(ctx?.scrollY).toBe(180);
    expect(ctx?.mentorId).toBe(42);
    expect(ctx?.role).toBe("superadmin");
  });

  it("denies access when requested by different role or user", () => {
    recordMentorsNavigation({
      query: "Dilshod",
      page: 1,
      pageSize: 20,
      mentorId: 42,
      role: "superadmin",
      userId: 1,
    });

    expect(getSavedMentorsReturnContext("mentor", 1)).toBeNull();
    expect(getSavedMentorsReturnContext("superadmin", 2)).toBeNull();
  });

  it("clears context on explicit clearSavedMentorsReturnContext", () => {
    recordMentorsNavigation({
      query: "Dilshod",
      page: 1,
      pageSize: 20,
      role: "superadmin",
      userId: 1,
    });

    clearSavedMentorsReturnContext();
    expect(getSavedMentorsReturnContext("superadmin", 1)).toBeNull();
  });

  it("safely restores scroll and focus to target row or heading without throwing", () => {
    document.body.innerHTML = `
      <h1>Mentors</h1>
      <div id="mentor-row-42">
        <a href="/mentors/42">Dilshod</a>
      </div>
    `;

    restoreMentorsScrollAndFocus(42, 120);

    const link = document.querySelector<HTMLAnchorElement>("#mentor-row-42 a");
    expect(link).not.toBeNull();
  });
});
