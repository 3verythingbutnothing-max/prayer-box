/** Small fictional directory. No live account lookup, contacts or search service. */
import { isOwnPrayerBox } from "./domain.ts";
import type { BoxId, Viewer } from "./domain.ts";

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
  options: { selected?: readonly BoxId[]; mariaVisible?: boolean; blocked?: readonly string[]; organizationOwnerId?: string } = {},
): PrayerRecipient[] {
  const needle = query.trim().replace(/^@/, "").normalize("NFKC").toLowerCase();
  return prayerRecipients.map(person => person.id === 'grace' && options.organizationOwnerId ? { ...person, actorId: options.organizationOwnerId } : person).filter(person => {
    if (isOwnPrayerBox(viewer, person.id, options.organizationOwnerId) || options.selected?.includes(person.id)) return false;
    if (options.blocked?.includes(person.actorId)) return false;
    if (person.id === "mine" && (viewer === "guest" || !friends.includes("elena"))) return false;
    if (person.id === "maria" && options.mariaVisible === false) return false;
    if (needle) return person.username.toLowerCase().includes(needle) || person.name.toLowerCase().includes(needle);
    return person.kind === "platform" || friends.includes(person.actorId);
  });
}
