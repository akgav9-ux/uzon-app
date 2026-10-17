import { describe, expect, it } from "vitest";
import {
  canComment,
  canDirectMessage,
  evaluateAudience,
  evaluatePrivacyRule,
  parseAudience,
  parsePrivacyRule,
  publicProfileFields,
  type RelationContext,
} from "@/lib/access";

const base: RelationContext = {
  viewerId: "viewer",
  ownerId: "owner",
  isOwner: false,
  viewerFollowsOwner: false,
  ownerFollowsViewer: false,
  isContact: false,
  isSelected: false,
  blocked: false,
  isStaff: false,
};

describe("evaluateAudience", () => {
  it("always allows the owner and staff", () => {
    expect(evaluateAudience("private", { ...base, isOwner: true })).toBe(true);
    expect(evaluateAudience("private", { ...base, isStaff: true })).toBe(true);
  });

  it("public content is visible to anonymous and everyone", () => {
    expect(evaluateAudience("public", base)).toBe(true);
    expect(evaluateAudience("public", { ...base, viewerId: null })).toBe(true);
  });

  it("followers-only content requires a follow", () => {
    expect(evaluateAudience("followers", base)).toBe(false);
    expect(evaluateAudience("followers", { ...base, viewerFollowsOwner: true })).toBe(true);
  });

  it("contacts audience accepts saved contacts or followers", () => {
    expect(evaluateAudience("contacts", base)).toBe(false);
    expect(evaluateAudience("contacts", { ...base, isContact: true })).toBe(true);
    expect(evaluateAudience("contacts", { ...base, viewerFollowsOwner: true })).toBe(true);
  });

  it("private content is never visible to others", () => {
    expect(evaluateAudience("private", { ...base, viewerFollowsOwner: true, isContact: true })).toBe(false);
  });

  it("a block always wins", () => {
    expect(evaluateAudience("public", { ...base, blocked: true })).toBe(false);
  });
});

describe("evaluatePrivacyRule", () => {
  it("defaults deny for nobody", () => {
    expect(evaluatePrivacyRule("nobody", base)).toBe(false);
  });

  it("selected requires the explicit allow-list", () => {
    expect(evaluatePrivacyRule("selected", base)).toBe(false);
    expect(evaluatePrivacyRule("selected", { ...base, isSelected: true })).toBe(true);
  });

  it("phone visibility rule is evaluated the same way", () => {
    expect(evaluatePrivacyRule("everyone", base)).toBe(true);
    expect(evaluatePrivacyRule("contacts", { ...base, isContact: false })).toBe(false);
  });
});

describe("derived rules", () => {
  it("blocks prevent messaging and calling", () => {
    expect(canDirectMessage("everyone", { ...base, blocked: true })).toBe(false);
    expect(canComment("everyone", true, { ...base, blocked: true })).toBe(false);
  });

  it("disabled comments win over privacy", () => {
    expect(canComment("everyone", false, base)).toBe(false);
  });

  it("private profiles are restricted for non-followers", () => {
    expect(publicProfileFields("private", base).restricted).toBe(true);
    expect(publicProfileFields("private", { ...base, viewerFollowsOwner: true }).restricted).toBe(false);
    expect(publicProfileFields("public", base).restricted).toBe(false);
  });
});

describe("parsers", () => {
  it("falls back to safe defaults", () => {
    expect(parseAudience("weird")).toBe("public");
    expect(parseAudience(null)).toBe("public");
    expect(parsePrivacyRule("weird")).toBe("nobody");
    expect(parsePrivacyRule("contacts")).toBe("contacts");
  });
});
