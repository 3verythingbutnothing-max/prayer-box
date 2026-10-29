/** Small fictional directory. No live account lookup, contacts or search service. */
import { isOwnPrayerBox } from "./domain.ts";
import type { BoxId, Viewer } from "./domain.ts";
import type { PrayerGroup } from './prayer-groups.ts';

export type RecipientCommunity = { id: string; name: string; username: string; boxId?: BoxId; availability: 'ready' | 'own' | 'unavailable' };
/** Suggestions use this account's current membership, never a friend's affiliation. */
export function approvedRecipientCommunities(groups: readonly PrayerGroup[], viewer: string, blocked: readonly string[] = []): RecipientCommunity[] {
  if (viewer === 'guest') return [];
  return groups.filter(group => !group.archivedAt && !blocked.includes(group.ownerId) && group.members.some(member => member.id === viewer && member.active && member.status === 'approved')).map(group => ({
    id: group.id, name: group.name, username: group.username,
    boxId: group.id === 'grace' ? 'grace' : undefined,
    availability: group.ownerId === viewer ? 'own' : group.id === 'grace' ? 'ready' : 'unavailable',
  }));
}

export interface PrayerRecipient {
  id: BoxId;
  actorId: string;
  name: string;
  username: string;
  kind: "personal" | "organization" | "platform";
}

export const prayerRecipients: readonly PrayerRecipient[] = [
  { id: "prayerbox", actorId: "team", name: "Prayer Box", username: "prayerbox", kind: "platform" },
  { id: "maria", actorId: "maria", name: "Maria", username: "maria", kind: "personal" },
  { id: "daniel", actorId: "daniel", name: "Daniel", username: "daniel", kind: "personal" },
  { id: "jordan", actorId: "jordan", name: "Jordan", username: "jordan", kind: "personal" },
  { id: "grace", actorId: "owner", name: "Grace Church", username: "gracechurch", kind: "organization" },
  { id: "mine", actorId: "elena", name: "Elena", username: "elena", kind: "personal" },
];

export const recipientNames: Record<BoxId, string> = {
  prayerbox: "Prayer Box", maria: "Maria", daniel: "Daniel", jordan: "Jordan",
  grace: "Grace Church", mine: "Elena",
};
export function recipientActor(box: BoxId, organizationOwnerId = "owner"): string {
  if (box === "grace") return organizationOwnerId;
  return prayerRecipients.find(person => person.id === box)?.actorId ?? box;
}

/** Own boxes and private profiles are excluded before matching, not after display. */
export function findPrayerRecipients(
  query: string,
  viewer: Viewer,
  friends: readonly string[],
  options: { selected?: readonly BoxId[]; mariaVisible?: boolean; blocked?: readonly string[]; organizationOwnerId?: string; organization?: { name: string; username: string }; usernames?: Readonly<Record<string, string>> } = {},
): PrayerRecipient[] {
  const needle = query.trim().replace(/^@/, "").normalize("NFKC").toLowerCase();
  return prayerRecipients.map(person => person.id === 'grace' ? { ...person, ...(options.organizationOwnerId ? {actorId:options.organizationOwnerId} : {}), ...(options.organization ? {name:options.organization.name,username:options.organization.username} : {}) } : person).map(person => person.kind === 'personal' && options.usernames?.[person.actorId] ? {...person, username:options.usernames[person.actorId]} : person).filter(person => {
    if (isOwnPrayerBox(viewer, person.id, options.organizationOwnerId) || options.selected?.includes(person.id)) return false;
    if (options.blocked?.includes(person.actorId)) return false;
    if (person.id === "mine" && (viewer === "guest" || !friends.includes("elena"))) return false;
    if (person.id === "maria" && options.mariaVisible === false) return false;
    if (needle) return person.username.toLowerCase().includes(needle) || person.name.toLowerCase().includes(needle) || person.id === 'grace' && 'gracechurch'.includes(needle);
    return person.kind === "platform" || person.kind === 'personal' && friends.includes(person.actorId);
  });
}
