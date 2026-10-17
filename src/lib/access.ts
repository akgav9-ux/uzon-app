/**
 * Pure access-control rules shared by the API layer and the unit tests.
 * Server code is the only authority — UI hiding is cosmetic.
 */

export type Audience = "public" | "followers" | "contacts" | "private";
export type PrivacyRule = "everyone" | "followers" | "contacts" | "selected" | "nobody";

export type RelationContext = {
  viewerId: string | null;
  ownerId: string;
  isOwner: boolean;
  viewerFollowsOwner: boolean;
  ownerFollowsViewer: boolean;
  isContact: boolean; // owner saved viewer as a contact
  isSelected: boolean; // viewer is on the owner's allow-list for the scope
  blocked: boolean; // block in either direction
  isStaff: boolean;
};

export function evaluateAudience(audience: Audience, ctx: RelationContext): boolean {
  if (ctx.isOwner || ctx.isStaff) return true;
  if (ctx.blocked) return false;
  switch (audience) {
    case "public":
      return true;
    case "followers":
      return ctx.viewerFollowsOwner;
    case "contacts":
      return ctx.isContact || ctx.viewerFollowsOwner;
    case "private":
      return false;
    default:
      return false;
  }
}

export function evaluatePrivacyRule(rule: PrivacyRule, ctx: RelationContext): boolean {
  if (ctx.isOwner || ctx.isStaff) return true;
  if (ctx.blocked) return false;
  switch (rule) {
    case "everyone":
      return true;
    case "followers":
      return ctx.viewerFollowsOwner;
    case "contacts":
      return ctx.isContact;
    case "selected":
      return ctx.isSelected;
    case "nobody":
      return false;
    default:
      return false;
  }
}

/** Can `viewerId` open a direct conversation with the owner? */
export function canDirectMessage(rule: PrivacyRule, ctx: RelationContext): boolean {
  if (ctx.blocked) return false;
  return evaluatePrivacyRule(rule, ctx);
}

/** Can the viewer place a call? */
export function canCall(rule: PrivacyRule, ctx: RelationContext): boolean {
  if (ctx.blocked) return false;
  return evaluatePrivacyRule(rule, ctx);
}

export function canComment(rule: PrivacyRule, enabled: boolean, ctx: RelationContext): boolean {
  if (!enabled) return false;
  if (ctx.blocked) return false;
  return evaluatePrivacyRule(rule, ctx);
}

export function canSeePhone(rule: PrivacyRule, ctx: RelationContext): boolean {
  return evaluatePrivacyRule(rule, ctx);
}

export function canSeeActivity(rule: PrivacyRule, ctx: RelationContext): boolean {
  return evaluatePrivacyRule(rule, ctx);
}

/** Private profiles only expose username + avatar to non-followers. */
export function publicProfileFields(visibility: string, ctx: RelationContext) {
  const restricted = visibility === "private" && !ctx.isOwner && !ctx.viewerFollowsOwner && !ctx.isStaff;
  return { restricted };
}

export function parseAudience(value: string | null | undefined): Audience {
  return value === "followers" || value === "contacts" || value === "private" ? value : "public";
}

export function parsePrivacyRule(value: string | null | undefined): PrivacyRule {
  return value === "everyone" || value === "followers" || value === "contacts" || value === "selected" || value === "nobody"
    ? value
    : "nobody";
}
