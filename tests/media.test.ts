import { describe, expect, it } from "vitest";
import { mediaSrc, publicUser, serializeMedia } from "@/lib/media";
import { avatarGradient, initials, parseCookies } from "@/lib/utils";

describe("media url resolution", () => {
  it("routes local assets through the access-checked endpoint", () => {
    expect(mediaSrc({ key: "abc-123.mp4" })).toBe("/api/media/abc-123.mp4");
  });

  it("uses the remote url for externally hosted demo assets", () => {
    expect(mediaSrc({ key: "remote-x.mp4", remoteUrl: "https://cdn.example.com/x.mp4" })).toBe("https://cdn.example.com/x.mp4");
  });

  it("returns null without a media row", () => {
    expect(mediaSrc(null)).toBeNull();
    expect(mediaSrc(undefined)).toBeNull();
  });
});

describe("serialisation helpers", () => {
  it("serialises media metadata", () => {
    const row = {
      id: "1",
      key: "k.mp4",
      remoteUrl: null,
      mime: "video/mp4",
      kind: "video",
      size: 10,
      width: 1080,
      height: 1920,
      durationMs: 5000,
      visibility: "public",
      status: "ready",
      ownerId: "u",
      originalName: null,
      createdAt: new Date(0),
    };
    const out = serializeMedia(row as never)!;
    expect(out.url).toBe("/api/media/k.mp4");
    expect(out.durationMs).toBe(5000);
    expect(serializeMedia(null)).toBeNull();
  });

  it("never leaks contact details in public user payloads", () => {
    const out = publicUser({
      id: "u",
      username: "aziza",
      displayName: "Aziza",
      avatarKey: "a.png",
      bio: "bio",
      isCreator: true,
      followersCount: 3,
      followingCount: 1,
    });
    expect(Object.keys(out)).not.toContain("phone");
    expect(Object.keys(out)).not.toContain("email");
    expect(out.avatarUrl).toBe("/api/media/a.png");
  });
});

describe("ui helpers", () => {
  it("builds initials and deterministic gradients", () => {
    expect(initials("Aziza Karimova")).toBe("AK");
    expect(initials("")).toBe("?");
    expect(avatarGradient("aziza")).toBe(avatarGradient("aziza"));
  });

  it("parses cookie headers", () => {
    expect(parseCookies("a=1; uzon_sid=token; b=2")).toEqual({ a: "1", uzon_sid: "token", b: "2" });
    expect(parseCookies(null)).toEqual({});
  });
});
