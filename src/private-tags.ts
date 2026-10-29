import type { PrayerRequest } from './domain.ts';
import { getStoryPosts } from './story.ts';

export const tagTones = ['lavender', 'sky', 'sage', 'rose', 'peach', 'butter'] as const;
export type TagTone = typeof tagTones[number];
export type PrayerTag = { label: string; tone: TagTone };
export type PrivateTagState = { catalog: PrayerTag[]; requests: Record<string, PrayerTag[]> };
export const emptyPrivateTags = (): PrivateTagState => ({ catalog: [], requests: {} });
export function normalizeTag(value: string): string {
  const clean = value.normalize('NFKC').trim().replace(/^#+/, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
  if (!clean || clean.length > 32 || !/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u.test(clean)) throw new Error('Use a tag of 1–32 letters, numbers, spaces, or hyphens.');
  return clean;
}
export function tagTone(label: string): TagTone {
  const familiar: Record<string,TagTone> = { financial:'sky', finance:'sky', health:'sage', spiritual:'lavender', family:'rose', love:'peach' };
  return familiar[label] ?? tagTones[[...label].reduce((sum,char)=>sum+char.codePointAt(0)!,0)%tagTones.length];
}
export function savePrivateTags(state: PrivateTagState, sourceId: string, tags: readonly PrayerTag[]): PrivateTagState {
  if (!sourceId || tags.length > 8) throw new Error('Add up to 8 tags per request.');
  const clean: PrayerTag[] = tags.map(tag => { if (!tagTones.includes(tag.tone)) throw new Error('Choose an available tag color.'); return {label:normalizeTag(tag.label),tone:tag.tone}; });
  const unique = [...new Map(clean.map(tag=>[tag.label,tag])).values()];
  const catalog = [...new Map([...state.catalog,...unique].map(tag=>[tag.label,tag])).values()];
  return { catalog, requests:{...state.requests,[sourceId]:unique} };
}
export function requestMatchesSearch(request: PrayerRequest, query: string, tags: readonly PrayerTag[]): boolean {
  const needle = query.normalize('NFKC').trim().toLocaleLowerCase('en');
  if (!needle) return true;
  if (needle.startsWith('#')) return tags.some(tag=>tag.label.includes(needle.replace(/^#+/,'').trim()));
  return [request.topic,request.text,...getStoryPosts(request).map(post=>post.text),...tags.map(tag=>tag.label)].some(text=>text.toLocaleLowerCase('en').includes(needle));
}
