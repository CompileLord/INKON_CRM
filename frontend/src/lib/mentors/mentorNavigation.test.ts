import { afterEach, describe, expect, it } from "vitest";
import { clearSavedMentorsReturnContext, recordMentorsNavigation } from "../users/returnContext";
import { mentorProfileTab, mentorReturnTarget } from "./mentorNavigation";

afterEach(clearSavedMentorsReturnContext);

describe("Mentor profile return ownership", () => {
  it("restores a validated directory search without allowing an external return destination", () => {
    const result = mentorReturnTarget("superadmin", 1, { returnTo: "https://outside.example", fromDirectory: { search: "  teacher\nname  ", page: 3, pageSize: 50, mentorId: 10 } });
    expect(result.to).toBe("/mentors?q=teacher+name&page=3&pageSize=50");
    expect(result.state?.fromDirectory.mentorId).toBe(10);
  });

  it("another admin cannot inherit the previous owner's saved directory context", () => {
    recordMentorsNavigation({ query: "private search", page: 4, pageSize: 50, mentorId: 10, role: "superadmin", userId: 1, scrollY: 400 });
    expect(mentorReturnTarget("superadmin", 2, null).to).toBe("/mentors");
  });

  it("self view always returns to Dashboard despite directory state", () => {
    expect(mentorReturnTarget("mentor", 10, { fromDirectory: { search: "teacher", page: 4 } }).to).toBe("/");
  });

  it("rejects malformed pagination and unknown tab state", () => {
    expect(mentorReturnTarget("superadmin", 1, { fromDirectory: { page: -10, pageSize: 999, mentorId: -1 } }).to).toBe("/mentors");
    for (const value of [null, [], "performance", { profileTab: "analytics" }, { profileTab: "../../admin" }]) expect(mentorProfileTab(value)).toBe("courses");
    expect(mentorProfileTab({ profileTab: "performance" })).toBe("performance");
    expect(mentorProfileTab({ profileTab: "documents" })).toBe("documents");
  });
});
