import { authorLabel } from './domain.ts';
import type { PrayerRequest } from './domain.ts';

/** Public byline only: never infer an author's church affiliation. */
export function requestIdentity(request: PrayerRequest, usernames: Readonly<Record<string, string>>, organizationName?: string) {
  return {
    name: authorLabel(request),
    username: request.anonymous ? undefined : usernames[request.authorId],
    // This names the actual group delivery, never a separate personal copy.
    organization: request.recipient === 'grace' ? organizationName : undefined,
  };
}
