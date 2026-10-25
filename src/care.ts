/**
 * Deterministic, fictional care workflows for the frontend prototype only.
 * These helpers do not notify a team, diagnose distress, provide counseling,
 * screen content, authenticate anyone, or enforce production confidentiality.
 */
import type { Moderation, PrayerRequest, Viewer } from "./domain.ts";

function normalizedText(text: string): string {
  return text
    .slice(0, 12000)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function selfHarmLanguage(text: string): boolean {
  // A negated or historical mention still permits a gentle optional resource
  // offer. It never establishes current risk, a diagnosis, or misconduct.
  const source = text.replace(/\bsuicide\s+(?:squad|doors)\b/g, "");
  if (/\bsuicid(?:e|al)\b|\bself[\s\u2010-\u2015-]*harm(?:ing)?\b/.test(source))
    return true;
  if (
    /\b(?:end|ending|take|taking)\s+(?:my|his|her|their|your|our)\s+(?:own\s+)?life\b/.test(
      source,
    )
  )
    return true;
  if (
    /\b(?:don'?t|doesn'?t|do not|does not)\s+want\s+to\s+(?:live|be alive)\b/.test(
      source,
    )
  )
    return true;
  if (
    /\b(?:want|wants|wanted|wish|wishes|planning|plan|plans)\s+to\s+die\b/.test(
      source,
    )
  )
    return true;
  if (
    /\b(?:better off without me|wish i (?:was|were) dead|wish i (?:wasn't|weren't) here|no reason to live)\b/.test(
      source,
    )
  )
    return true;
  const harmReflexive =
    /\b(?:hurt|hurting|harm|harming|harmed|cut|cutting|kill|killed|killing)\s+(?:myself|yourself|himself|herself|themselves|themself|ourselves|yourselves)\b/;
  if (!harmReflexive.test(source)) return false;
  const intentional =
    /\b(?:will|want to|wants to|planning to|plan to|plans to|going to|on purpose|intentionally)\b/.test(
      source,
    );
  const accident =
    /\b(?:accidentally|by accident|tripped|fell|while (?:gardening|cooking|running|playing|working)|cutting vegetables)\b/.test(
      source,
    );
  return intentional || !accident;
}

/** A gentle resource-offer cue, never a diagnosis or an abuse/moderation verdict. */
export function hasSupportLanguage(text: string): boolean {
  const source = normalizedText(text);
  if (selfHarmLanguage(source)) return true;
  const distress = source.replace(
    /\b(?:not|never|no longer)\s+(?:feeling\s+)?(?:hopeless|overwhelmed|depressed)\b/g,
    "",
  );
  return /\b(?:hopeless|overwhelmed|depressed|panicking|distressed|in distress|feel unsafe|feels unsafe|feeling unsafe|can't cope|cannot cope|can't go on|cannot go on|can't keep going|cannot keep going|not coping)\b/.test(
    distress,
  );
}

function contextualReason(text: string): string {
  const source = normalizedText(text);
  // Choose only bounded, authored-context categories. Never quote arbitrary
  // handles, links, threats, identifying details, or a whole sensitive request.
  if (selfHarmLanguage(source)) return "the pain and concern you described";
  if (
    /\b(?:grief|grieving|bereaved|bereavement|died|death|passed away|funeral)\b|\blost\s+(?:my|our)\s+(?:mum|mom|mother|dad|father|sister|brother|son|daughter|child|husband|wife|partner|friend)\b/.test(
      source,
    )
  ) {
    return "the loss and grief you are carrying";
  }
  if (/\b(?:caregiver|caregiving|caring for|carer)\b/.test(source))
    return "the responsibilities of caring for someone";
  if (
    /\b(?:surgery|surgical|hospital|doctor|illness|ill|sick|diagnosis|treatment|health|medical|appointment)\b/.test(
      source,
    )
  ) {
    const relative = source.match(
      /\b(?:my|our)\s+(mum|mom|mother|dad|father|sister|brother|son|daughter|child|husband|wife|partner|grandmother|grandfather|friend)\b/,
    )?.[1];
    const medicalConcern = /\b(?:surgery|surgical)\b/.test(source)
      ? "surgery and medical care"
      : "health and care";
    return relative
      ? `your ${relative}’s ${medicalConcern}`
      : `the ${medicalConcern} you described`;
  }
  if (
    /\b(?:rent|bills?|financial|money|job|work|employment|unemployed|interview)\b/.test(
      source,
    )
  ) {
    if (/\b(?:rent|bills?|financial|money)\b/.test(source))
      return "the worries around daily needs and financial stability";
    if (/\binterview\b/.test(source))
      return "the interview and next step you described";
    return "the work and next steps on your heart";
  }
  if (/\b(?:driving test|driver's test|driving exam)\b/.test(source))
    return "the driving test ahead";
  if (
    /\b(?:exam|exams|school|studies|studying|college|university|homework)\b/.test(
      source,
    )
  )
    return "the studies and responsibilities you described";
  if (/\b(?:recovery|recovering|addiction|sober|sobriety)\b/.test(source))
    return "the recovery journey you described";
  if (/\b(?:missing|lost)\b/.test(source) && /\b(?:cat|dog|pet)\b/.test(source))
    return "the missing pet you described";
  if (/\b(?:decision|decide|wisdom|new chapter|choice)\b/.test(source))
    return "the decision and need for wisdom you shared";
  if (
    /\b(?:question|questions|understand|understanding|doubt|learning)\b/.test(
      source,
    ) &&
    /\b(?:god|jesus|faith|trinity|pray|prayer)\b/.test(source)
  )
    return "your questions about faith and prayer";
  if (
    /\b(?:family|relationship|relationships|marriage|divorce|separation|sister|brother|husband|wife|partner)\b/.test(
      source,
    )
  )
    return "the people and relationships on your heart";
  if (
    hasSupportLanguage(source) ||
    /\b(?:anxiety|anxious|lonely|loneliness|panic|afraid)\b/.test(source)
  )
    return "the heaviness and worries you are carrying";
  if (/\b(?:thankful|gratitude|grateful|giving thanks)\b/.test(source))
    return "the gratitude you shared";
  return "what is on your heart today";
}

/**
 * Mint once for a specific accepted revision; callers store the returned string.
 * `topic` is display context only. It cannot replace the actual request text,
 * because composer titles may be stale. No model or external service is called.
 */
export function buildPlatformAcknowledgment(
  text: string,
  topic: string,
  state: Moderation = "approved",
): string {
  void topic;
  const opening = `Thank you for sharing about ${contextualReason(text)}.`;
  if (state === "approved") {
    return `${opening} The Prayer Box team will be praying for you; keep bringing this honestly to God, one step at a time.`;
  }
  if (state === "changes")
    return `${opening} This version needs changes and has not been delivered; you can revise it or ask for human review.`;
  if (state === "appeal")
    return `${opening} Your appeal is awaiting human review and this version has not been delivered; no team follow-up is confirmed.`;
  return `${opening} Your request is awaiting review and has not been delivered; this note does not mean the team has read it or begun praying.`;
}

/** No recipient, church role, safety role, or testimony view inherits this note. */
export function canSeePlatformAcknowledgment(
  request: PrayerRequest,
  viewer: Viewer,
  testimonyOnly = false,
): boolean {
  return (
    !testimonyOnly &&
    viewer !== "guest" &&
    request.authorId === viewer &&
    Boolean(request.platformAcknowledgment?.trim())
  );
}

export interface CareConcern {
  id: string;
  requestId: string;
  authorId: string;
  title: string;
  evidence: string;
  anonymous: boolean;
  reportedBy: Viewer;
  status: "new" | "support-sent" | "closed";
}

export interface SupportNote {
  id: string;
  concernId: string;
  /** The request author is the intended private recipient, not the operator. */
  authorId: string;
  requestId: string;
}

/** Repeated reports never become multiple concerns or votes against an author. */
export function addCareConcern(
  existing: CareConcern[],
  next: CareConcern,
): CareConcern[] {
  return existing.some((concern) => concern.requestId === next.requestId)
    ? existing
    : [...existing, next];
}

/** Notes are private to their exact recipient; operator access is not implied. */
export function visibleSupportNotes(
  notes: SupportNote[],
  viewer: Viewer,
): SupportNote[] {
  if (viewer === "guest") return [];
  return notes.filter((note) => note.authorId === viewer);
}
