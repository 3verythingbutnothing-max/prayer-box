/**
 * Fictional fixtures and presentation rules for the local frontend prototype.
 * Every fixture is bundled in the browser. This is NOT authorization, anonymity,
 * content screening, church verification, storage, or production security.
 */
export type Viewer =
  "elena" | "maria" | "member" | "owner" | "guest" | "operator" | "team";
export type BoxId = "maria" | "grace" | "mine" | "daniel" | "jordan" | "prayerbox";
/** Prototype ownership only; future submission authorization belongs on a server. */
export function isOwnPrayerBox(actor: string, box: BoxId, organizationOwnerId = "owner"): boolean {
  return (
    (box === "mine" && actor === "elena") ||
    (box === "maria" && actor === "maria") ||
    (box === "grace" && actor === organizationOwnerId) ||
    (box === "daniel" && actor === "daniel") ||
    (box === "jordan" && actor === "jordan") ||
    (box === "prayerbox" && actor === "team")
  );
}
export function prayerBoxUrl(pageUrl: string, box: BoxId): string {
  const url = new URL(pageUrl);
  url.search = "";
  url.hash = `box/${box}`;
  return url.href;
}
export type Audience = "public" | "friends" | "private";
export function getEffectiveAudience(
  request: Audience,
  author: Audience = "public",
  box: Audience = "public",
): Audience {
  const limits = [request, author, box];
  return limits.includes("private")
    ? "private"
    : limits.includes("friends")
      ? "friends"
      : "public";
}
export type Moderation = "approved" | "pending" | "changes" | "appeal";

export interface PendingTextEdit {
  text: string;
  title?: string;
  submittedAt: string;
  expectedRevision: number;
  reason: string;
}

export interface Reply {
  editedAt?: string;
  deletedAt?: string;
  revision?: number;
  pendingEdit?: PendingTextEdit;
  parentReplyId?: string;
  /** Private per-viewer agreement state; no public counts or rankings. */
  agreedBy?: string[];
  testimonyId?: string;
  postedAt?: string;
  storyRevision?: string;
  id: string;
  actorId?: string;
  name: string;
  text: string;
  automatic?: boolean;
  official?: boolean;
  audio?: boolean;
}

export interface PrayerPost {
  editedAt?: string;
  revision?: number;
  pendingEdit?: PendingTextEdit;
  id: string;
  text: string;
  kind: "testimony" | "update";
  createdAt: string;
}

export interface PrayerRequest {
  editedAt?: string;
  revision?: number;
  pendingEdit?: PendingTextEdit;
  id: string;
  sourceId: string;
  authorId: string;
  authorName: string;
  recipient: BoxId;
  anonymous: boolean;
  audience: Audience;
  authorCeiling?: Audience;
  text: string;
  topic: string;
  createdAt: string;
  postedAt?: string;
  media?: { kind: "photo" | "audio" | "video"; status: "approved" | "pending" };
  testimony?: {
    id: string;
    text: string;
    kind: "testimony" | "update";
    createdAt?: string;
    editedAt?: string;
    revision?: number;
    pendingEdit?: PendingTextEdit;
  };
  posts?: PrayerPost[];
  replies: Reply[];
  moderation: Moderation;
  reviewReason?: string;
  platformAcknowledgment?: string;
  assignedTo?: string;
  workState: "new" | "assigned" | "follow-up" | "archived";
}

/** Names, situations, conversations, and delivery states are invented examples. */
export const seedRequests: PrayerRequest[] = [
  {
    id: "demo-8a1ba012-7495-4864-8a2c-6e988533d359",
    sourceId: "story-quiet-courage",
    authorId: "nora",
    authorName: "Nora",
    recipient: "maria",
    anonymous: true,
    audience: "public",
    topic: "For a little courage",
    createdAt: "This morning",
    postedAt: "2026-10-24T09:00:00Z",
    text: "My mum has an appointment next week, and the waiting feels heavy. Please pray for peace for her, patience for our family, and wisdom for the people caring for her.",
    replies: [
      {
        id: "reply-quiet-1",
        postedAt: "2026-10-24T10:15:00Z",
        actorId: "maria",
        name: "Maria",
        text: "May the Father hold your family close as you wait. I am praying for peace and wisdom in Jesus’ name.",
      },
    ],
    moderation: "approved",
    workState: "new",
  },
  {
    id: "demo-ac66527e-3ea8-44d5-94b8-cf6089decfe2",
    sourceId: "story-room-for-grief",
    authorId: "leah",
    authorName: "Leah",
    recipient: "maria",
    anonymous: false,
    audience: "public",
    topic: "Room for grief",
    createdAt: "Yesterday",
    postedAt: "2026-10-23T14:00:00Z",
    text: "This is our first autumn without Dad. Small things still catch me by surprise. Please pray that we can be gentle with each other and find room for both sadness and gratitude.",
    testimony: {
      id: "testimony-room-for-grief",
      createdAt: "2026-10-24T11:00:00Z",
      kind: "testimony",
      text: "A friend sat with me over tea this week. Nothing was fixed, but I felt less alone. I am thankful for that little kindness, and still asking for prayer as we grieve.",
    },
    replies: [
      {
        id: "reply-grief-1",
        postedAt: "2026-10-24T12:30:00Z",
        actorId: "daniel",
        name: "Daniel",
        text: "There is room for your sadness here. May God comfort you and your family, one ordinary day at a time.",
      },
    ],
    moderation: "approved",
    workState: "follow-up",
  },
  {
    id: "demo-734d446f-1f25-44af-bdd7-f4b5b0b35428",
    sourceId: "story-maria-waiting",
    authorId: "maria",
    authorName: "Maria",
    recipient: "mine",
    anonymous: false,
    audience: "private",
    topic: "While we wait",
    createdAt: "This morning",
    postedAt: "2026-10-24T09:00:00Z",
    text: "I am helping my sister through a difficult season and sometimes feel unsure what to say. Please pray that I listen well, keep healthy boundaries, and offer steady kindness.",
    replies: [],
    moderation: "approved",
    workState: "new",
  },
  {
    id: "demo-40a9acd3-c8eb-4573-a631-22753741e6d7",
    sourceId: "story-daniel-work",
    authorId: "daniel",
    authorName: "Daniel",
    recipient: "mine",
    anonymous: false,
    audience: "private",
    topic: "A new beginning",
    createdAt: "Yesterday",
    postedAt: "2026-10-23T14:00:00Z",
    text: "I am looking for work and worrying about paying rent. Please pray for a suitable opportunity, clear thinking, and the courage to ask my local church for practical guidance.",
    testimony: {
      id: "update-daniel-work",
      createdAt: "2026-10-24T11:00:00Z",
      kind: "update",
      text: "Still looking, and still taking one step at a time. Thank you for continuing to pray. I have an application to finish this week.",
    },
    replies: [],
    moderation: "approved",
    workState: "follow-up",
  },
  {
    id: "demo-3cd40502-4b5d-4b45-b448-2fb3619b20d7",
    sourceId: "story-elena-new-chapter",
    authorId: "elena",
    authorName: "Elena",
    recipient: "maria",
    anonymous: false,
    audience: "private",
    authorCeiling: "private",
    topic: "A little wisdom",
    createdAt: "Yesterday",
    postedAt: "2026-10-23T14:00:00Z",
    text: "I am beginning a new chapter and finding it hard to make a decision. Please pray for wisdom, patience, and a heart that is willing to follow God’s lead.",
    replies: [
      {
        id: "receipt-maria-new-chapter",
        actorId: "maria",
        name: "Maria",
        automatic: true,
        text: "Thank you for trusting my prayer box with your request. You are welcome to return here with an update.",
      },
      {
        id: "reply-maria-new-chapter",
        postedAt: "2026-10-23T16:20:00Z",
        actorId: "maria",
        name: "Maria",
        text: "You can take time with this. I am praying for wisdom and for peace as you consider the next step.",
      },
    ],
    moderation: "approved",
    workState: "new",
  },
  {
    id: "demo-5c3123db-6ff2-46b0-915e-656e0f2f48c1",
    sourceId: "story-elena-new-chapter",
    authorId: "elena",
    authorName: "Elena",
    recipient: "grace",
    anonymous: true,
    audience: "private",
    authorCeiling: "private",
    topic: "A little wisdom",
    createdAt: "Yesterday",
    postedAt: "2026-10-23T14:00:00Z",
    text: "I am beginning a new chapter and finding it hard to make a decision. Please pray for wisdom, patience, and a heart that is willing to follow God’s lead.",
    replies: [
      {
        id: "receipt-grace-new-chapter",
        actorId: "owner",
        name: "Grace Church",
        automatic: true,
        official: true,
        text: "Your request has reached this prayer box. Thank you for sharing it with our prayer community. You are welcome to return with an update.",
      },
    ],
    moderation: "approved",
    assignedTo: "Maria",
    workState: "assigned",
  },
  {
    id: "demo-be80d812-c8ac-4637-930a-37fd981f43cb",
    sourceId: "story-ruth-rest",
    authorId: "ruth",
    authorName: "Ruth",
    recipient: "grace",
    anonymous: false,
    audience: "private",
    topic: "Rest for a caregiver",
    createdAt: "This week",
    postedAt: "2026-10-21T14:00:00Z",
    text: "Caring for my husband has been tiring lately. Please pray for strength for today, good support around us, and the humility to rest when I need to.",
    replies: [
      {
        id: "reply-ruth-rest",
        postedAt: "2026-10-21T17:00:00Z",
        actorId: "maria",
        name: "Maria · Grace Church prayer community",
        text: "May the Holy Spirit help you in the moments when words feel hard. We can keep bringing today’s needs to the Father through Jesus.",
      },
    ],
    moderation: "approved",
    assignedTo: "Samuel",
    workState: "assigned",
  },
  {
    id: "demo-35f4d5a5-9b7c-46ec-b609-293e897375ba",
    sourceId: "story-ben-ordinary-days",
    authorId: "ben",
    authorName: "Ben",
    recipient: "grace",
    anonymous: false,
    audience: "public",
    topic: "Grace for ordinary days",
    createdAt: "This week",
    postedAt: "2026-10-21T14:00:00Z",
    text: "I am learning to pray again after a long time away. I do not have many words yet. Please pray that I keep coming honestly to God, even on the ordinary and uncertain days.",
    media: { kind: "audio", status: "approved" },
    replies: [
      {
        id: "reply-ben-ordinary",
        postedAt: "2026-10-22T09:15:00Z",
        actorId: "owner",
        name: "Grace Church",
        official: true,
        text: "You are welcome to ask, even when words are few. May you know the Father’s care, through Jesus Christ, with the help of the Holy Spirit.",
      },
    ],
    moderation: "approved",
    workState: "new",
  },
  {
    id: "demo-96942ac9-ad7d-4529-9ece-0ba84aecff4f",
    sourceId: "story-elena-awaiting-text",
    authorId: "elena",
    authorName: "Elena",
    recipient: "maria",
    anonymous: false,
    audience: "private",
    topic: "A question of faith",
    createdAt: "A moment ago",
    postedAt: "2026-10-24T15:00:00Z",
    text: "I have a question about something I heard about the Trinity. Please pray for understanding while I work through it with a trusted pastor.",
    replies: [],
    moderation: "pending",
    reviewReason:
      "A fictional contextual-review hold. A sincere question is welcome; a person would check context before releasing this example.",
    workState: "new",
  },
  {
    id: "demo-10a831df-da74-4e24-adef-bae14f79f85c",
    sourceId: "story-elena-awaiting-photo",
    authorId: "elena",
    authorName: "Elena",
    recipient: "grace",
    anonymous: true,
    audience: "private",
    topic: "Peace in a busy season",
    createdAt: "A moment ago",
    postedAt: "2026-10-24T15:00:00Z",
    text: "There is a lot changing at once. Please pray that I can notice what matters, care for the people around me, and find quiet moments with God.",
    media: { kind: "photo", status: "pending" },
    replies: [],
    moderation: "approved",
    workState: "new",
  },
];

// These are explicitly accepted fictional friendships. Organization membership
// is a separate relation; merely using the member/owner demo never adds friends.
const acceptedFriends: Readonly<Record<string, readonly string[]>> = {
  elena: ["maria", "daniel"],
  maria: ["elena"],
  daniel: ["elena"],
};

const defaultBoxCeilings: Record<BoxId, Audience> = {
  maria: "public",
  grace: "public",
  mine: "private",
  daniel: "public",
  jordan: "public",
  prayerbox: "private",
};

/** Trusted root-owned fictional state, never browser-derived production authority. */
export interface DemoAccessContext {
  /** When supplied, this exact current membership list replaces every legacy default. */
  graceApprovedMemberIds?: readonly string[];
  elenaApprovedMember?: boolean;
  memberActive?: boolean;
  acceptedElenaFriends?: readonly string[];
  boxCeilings?: Partial<Record<BoxId, Audience>>;
}

function isAcceptedFriend(
  viewer: Viewer,
  authorId: string,
  context: DemoAccessContext,
): boolean {
  // The supplied root fixture represents a mutually accepted relation. A pending
  // invitation must never enter this list. Defaults preserve the seed scenario.
  const elenaFriends = context.acceptedElenaFriends ?? acceptedFriends.elena;
  if (viewer === "elena") return elenaFriends.includes(authorId);
  if (authorId === "elena")
    return viewer !== "guest" && elenaFriends.includes(viewer);
  return (
    viewer !== "guest" &&
    (acceptedFriends[viewer]?.includes(authorId) ?? false) &&
    (acceptedFriends[authorId]?.includes(viewer) ?? false)
  );
}

function isAuthor(request: PrayerRequest, viewer: Viewer): boolean {
  return viewer !== "guest" && request.authorId === viewer;
}

function isIntendedRecipient(
  request: PrayerRequest,
  viewer: Viewer,
  context: DemoAccessContext,
): boolean {
  return (
    (request.recipient === "mine" && viewer === "elena") ||
    (request.recipient === "maria" && viewer === "maria") ||
    (request.recipient === "prayerbox" && viewer === "team") ||
    (request.recipient === "grace" &&
      (context.graceApprovedMemberIds !== undefined
        ? viewer !== "guest" && context.graceApprovedMemberIds.includes(viewer)
        : ((viewer === "member" && context.memberActive !== false) ||
        viewer === "owner" ||
        viewer === "maria" ||
        (viewer === "elena" && context.elenaApprovedMember === true))))
  );
}

/** DEMO view selection only. Production needs server checks on every resource. */
export function canViewRequest(
  request: PrayerRequest,
  viewer: Viewer,
  context: DemoAccessContext = {},
): boolean {
  if (isAuthor(request, viewer)) return true;
  if (request.moderation !== "approved") return false;
  if (isIntendedRecipient(request, viewer, context)) return true;

  const boxCeiling =
    context.boxCeilings?.[request.recipient] ??
    defaultBoxCeilings[request.recipient];
  const authorCeilings = [request.audience, request.authorCeiling ?? "public"];
  if (boxCeiling === "private" || authorCeilings.includes("private"))
    return false;
  if (
    authorCeilings.includes("friends") &&
    !isAcceptedFriend(viewer, request.authorId, context)
  )
    return false;
  if (boxCeiling === "friends") {
    // Personal boxes add their owner's accepted-friend requirement. Intersect
    // this with the author's circle; never substitute it or use their union.
    const boxOwner =
      request.recipient === "maria"
        ? "maria"
        : request.recipient === "mine"
          ? "elena"
          : request.recipient === "daniel"
            ? "daniel"
            : request.recipient === "jordan"
              ? "jordan"
          : null;
    // Grace's separate outsider circle is not modeled in these fixtures. Deny
    // outsider access instead of inheriting a member's personal friend list.
    if (!boxOwner || !isAcceptedFriend(viewer, boxOwner, context)) return false;
  }
  return true;
}

/** Filter the currently affected fictional box/view; do not mutate other copies. */
export function visibleRequests(
  requests: PrayerRequest[],
  viewer: Viewer,
  blockedAuthorIds: string[] = [],
  context: DemoAccessContext = {},
): PrayerRequest[] {
  const blocked = new Set(blockedAuthorIds);
  return requests.filter(
    (request) =>
      !blocked.has(request.authorId) &&
      canViewRequest(request, viewer, context),
  );
}

export function authorLabel(request: PrayerRequest): string {
  return request.anonymous ? "Anonymous" : request.authorName;
}

export function getAudienceLabel(audience: Audience, recipient: BoxId): string {
  if (audience === "public") return "Everyone";
  if (audience === "friends") return "My Church · accepted friends";
  if (recipient === "grace") return "Organization-only";
  const names: Record<BoxId, string> = {
    maria: "Maria", mine: "Elena", grace: "Grace Church",
    daniel: "Daniel", jordan: "Jordan", prayerbox: "the Prayer Box prayer team",
  };
  return `Sender and ${names[recipient]} only`;
}

/** Limited demo cue for explicit outward intent; never a full safety classifier. */
function hasOutwardThreatExample(normalized: string): boolean {
  if (/\byou\s+should\s+die\b/.test(normalized)) return true;
  const directIntent =
    /\b(?:(?:i|we)\s+(?:will|shall|want\s+to|intend\s+to|plan\s+to|am\s+going\s+to|are\s+going\s+to)|(?:i|we)'ll|i'm\s+going\s+to|we're\s+going\s+to)\s+(?:hurt|kill|attack)\b/g;
  const selfTarget = /^(?:myself|ourselves|my\s+self|our\s+selves|me|us)\b/;
  const clearlyInnocentTarget =
    /^(?:time|(?:a|the|this)\s+(?:computer\s+)?(?:process|program|bug|problem|task)|(?:some|the)\s+weeds|(?:a|the)\s+few\s+minutes|after|when|because|during|from|for|while|if)\b/;

  function targetsOthers(target: string): boolean {
    const object = target.trim().replace(/^["'“”]+/, "");
    if (!object || clearlyInnocentTarget.test(object)) return false;
    const self = object.match(selfTarget);
    if (!self) return true; // Names and arbitrary outward targets remain reviewable.
    const remainder = object.slice(self[0].length).trim();
    const continuation = remainder.match(
      /^(?:,\s*)?(?:and|or|as\s+well\s+as|along\s+with)\s+(?:then\s+)?(.+)$/,
    );
    if (!continuation) return false;
    const next = continuation[1].replace(/^(?:hurt|kill|attack)\s+/, "");
    // These begin a feeling/help/negated clause rather than another target.
    // A second explicit threat is independently found by directIntent below.
    if (
      /^(?:i|we|need|want|feel|hope|wish|please|not|never|don'?t|do\s+not|can'?t|cannot)\b/.test(
        next,
      )
    )
      return false;
    return targetsOthers(next);
  }

  for (const intent of normalized.matchAll(directIntent)) {
    const afterIntent = normalized.slice(
      (intent.index ?? 0) + intent[0].length,
    );
    const target = afterIntent.slice(0, 200).split(/[.!?;]/, 1)[0];
    if (targetsOthers(target)) return true;
  }
  return false;
}

/**
 * A deliberately limited, deterministic walkthrough of review states.
 * This does not inspect media, authenticate users, detect all abuse, judge
 * doctrine, or call a model/provider. Its result is never a security guarantee.
 */
export function screenText(text: string): {
  state: "approved" | "pending" | "changes";
  reason: string;
  category: string;
} {
  const normalized = text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return {
      state: "changes",
      category: "Empty request",
      reason: "Add a few words about what you would like prayer for.",
    };
  }

  const paymentDetail =
    /cash\s*app|cash\.app|venmo|paypal\.me|gofundme|ko-fi\.com|buymeacoffee\.com|\$[a-z][a-z\d_]{2,}|\b0x[a-f\d]{40}\b|\bbc1[a-z\d]{25,}/.test(
      normalized,
    );
  const asksForMoney =
    /\b(?:please\s+)?(?:donate(?:\s+(?:to|at|here|now))?|send\s+(?:me\s+)?money|send\s+cash|give\s+me\s+money|buy\s+(?:me\s+)?(?:a\s+)?gift\s*cards?)\b|\bmy\s+(?:cash\s*app|venmo|paypal)\b/.test(
      normalized,
    );
  const warningContext =
    /\b(?:someone\s+(?:sent|asked)|i\s+(?:received|got|was\s+asked)|report(?:ing)?\s+(?:a\s+)?scam|warn(?:ing)?\s+(?:about|of)|avoid\s+(?:this|a)\s+scam)\b/.test(
      normalized,
    );
  const personalSolicitation =
    /\b(?:send\s+me\s+money|give\s+me\s+money|my\s+(?:cash\s*app|venmo|paypal))\b/.test(
      normalized,
    );
  if (
    (paymentDetail || asksForMoney) &&
    warningContext &&
    !personalSolicitation
  ) {
    return {
      state: "pending",
      category: "Financial context",
      reason:
        "This example may be describing a payment scam. A human would review the context. Remove active payment details before sharing.",
    };
  }
  if (paymentDetail || asksForMoney) {
    return {
      state: "changes",
      category: "Payment solicitation",
      reason:
        "This example contains payment instructions or a request for money. Prayer Box is for prayer. Remove payment handles and fundraising links; asking for prayer about financial hardship is welcome. You can appeal if we misunderstood.",
    };
  }
  if (hasOutwardThreatExample(normalized)) {
    return {
      state: "pending",
      category: "Safety review",
      reason:
        "This example contains language that may threaten someone. It would be held for human review; it has not been delivered.",
    };
  }
  if (
    /\b(?:the\s+trinity\s+is\s+false|three\s+separate\s+gods|jesus\s+is\s+a\s+created\s+being)\b/.test(
      normalized,
    )
  ) {
    return {
      state: "pending",
      category: "Theological context",
      reason:
        "This example needs a person to review its theological context. Sincere questions and simple prayers to Jesus are welcome. A keyword cannot decide a person’s beliefs.",
    };
  }
  if (/(\b[a-z\d]{2,}\b)(?:\s+\1){5,}/i.test(normalized)) {
    return {
      state: "pending",
      category: "Possible repeated content",
      reason:
        "This example contains a repeated pattern and would be held for review. A flag does not establish that an account is a spammer.",
    };
  }
  if (normalized.length > 5000) {
    return {
      state: "pending",
      category: "Long-content example",
      reason:
        "This long example would need review. No request has been delivered while the review is pending.",
    };
  }
  return {
    state: "approved",
    category: "Demo check",
    reason:
      "This example passed the limited demo rules. Live text and media screening are not connected; this is not a safety guarantee.",
  };
}
