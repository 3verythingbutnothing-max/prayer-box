import { useId, useRef, useState } from "react";
import type { BoxId, Viewer } from "../domain";
import { approvedRecipientCommunities, findPrayerRecipients, recipientNames } from "../recipients";
import type { PrayerGroup } from '../prayer-groups';
import { Icon, PrayerBoxMark } from "../ui";
import "../recipient-picker.css";

export default function RecipientPicker({
  selected, onChange, viewer, friends, mariaVisible = true, blocked = [], organizationOwnerId, usernames, groups = [],
}: {
  selected: BoxId[];
  onChange: (ids: BoxId[]) => void;
  viewer: Viewer;
  friends: readonly string[];
  mariaVisible?: boolean;
  blocked?: readonly string[];
  organizationOwnerId?: string;
  usernames?: Readonly<Record<string, string>>;
  groups?: readonly PrayerGroup[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const resultButtons = useRef(new Map<BoxId,HTMLButtonElement>());
  const helpId = useId();
  const organization = groups.find(group => group.id === 'grace' && !group.archivedAt);
  const labels = {...recipientNames, ...(organization ? {grace:organization.name} : {})};
  const communities = approvedRecipientCommunities(groups,viewer,blocked);
  const needle = query.trim().replace(/^@/,'').normalize('NFKC').toLowerCase();
  const shownCommunities = communities.filter(group => !needle || `${group.name} ${group.username}`.toLowerCase().includes(needle) || group.id === 'grace' && 'gracechurch'.includes(needle));
  const matches = findPrayerRecipients(query, viewer, friends, { mariaVisible, blocked, organizationOwnerId, usernames, organization }).filter(person => !(person.id === 'grace' && groups.some(group => group.id === 'grace' && group.archivedAt)) && !communities.some(group => group.boxId === person.id));
  const toggle = (id: BoxId) => {
    const removing = selected.includes(id);
    onChange(removing ? selected.filter(box => box !== id) : [...new Set([...selected,id])]);
    setStatus(`${labels[id]} ${removing ? 'removed' : 'selected'}.`);
  };
  return (
    <fieldset className="recipient-picker">
      <legend>Where will this go?</legend>
      <p id={helpId} className="quiet-copy">Choose friends or approved communities, or search by name or @username.</p>
      <div className="recipient-chips" aria-label="Selected prayer boxes">
        {selected.map(id => (
          <span className="recipient-chip" key={id}>
            {id === "prayerbox" ? <PrayerBoxMark size={23} /> : <Icon name="box" size={18} />}
            {labels[id]}
            <button type="button" aria-label={`Remove ${labels[id]} recipient`} onClick={event => { event.currentTarget.focus({preventScroll:true}); toggle(id); if (event.detail === 0) (resultButtons.current.get(id) ?? input.current)?.focus({preventScroll:true}); }}><Icon name="close" size={16} /></button>
          </span>
        ))}
        {!selected.length && <span className="recipient-empty">No recipients selected</span>}
      </div>
      <label className="field recipient-search-label">
        Find a prayer box
        <div className="recipient-search-input">
          <Icon name="search" size={21} />
          <input ref={input} type="search" value={query} autoComplete="off" placeholder="Search a name or @username" aria-describedby={helpId} onChange={event => setQuery(event.target.value)} />
        </div>
      </label>
      <div className="recipient-results" aria-label="Prayer box search results">
        {matches.map(person => (
          <button ref={element => { if (element) resultButtons.current.set(person.id,element); else resultButtons.current.delete(person.id); }} type="button" className="recipient-result" aria-pressed={selected.includes(person.id)} key={person.id} onClick={event => { event.currentTarget.focus({preventScroll:true}); toggle(person.id); }}>
            <span className={`recipient-result-icon ${person.kind === "platform" ? "recipient-platform" : ""}`}>{person.kind === "platform" ? <PrayerBoxMark size={28} /> : <Icon name={person.kind === "organization" ? "people" : "box"} size={23} />}</span>
            <span><strong>{person.name}</strong><small>@{person.username} · {person.kind === "platform" ? "Prayer Box prayer team" : person.kind === "organization" ? "Church prayer community" : "Personal prayer box"}</small></span>
            <Icon name={selected.includes(person.id) ? 'check' : 'plus'} size={20} />
          </button>
        ))}
        {!matches.length && !shownCommunities.length && <p className="quiet-copy" role="status">{query.trim() ? "No matching prayer box found." : "Search a name or @username to find another prayer box."}</p>}
      </div>
      {shownCommunities.length > 0 && <section className="recipient-communities" aria-labelledby={`${helpId}-communities`}><h3 id={`${helpId}-communities`}>Your communities</h3><div className="recipient-results">{shownCommunities.map(group => <button ref={element => { if (group.boxId) { if (element) resultButtons.current.set(group.boxId,element); else resultButtons.current.delete(group.boxId); } }} type="button" className="recipient-result" key={group.id} disabled={group.availability !== 'ready'} aria-pressed={group.boxId ? selected.includes(group.boxId) : false} onClick={event => { if (group.boxId && group.availability === 'ready') { event.currentTarget.focus({preventScroll:true}); toggle(group.boxId); } }}>
        <span className="recipient-result-icon"><Icon name="people" size={23}/></span><span><strong>{group.name}</strong><small>@{group.username} · {group.availability === 'own' ? 'Your own box · choose another recipient' : group.availability === 'unavailable' ? 'Requests aren’t available yet' : 'Approved community'}</small></span>{group.availability === 'ready' && <Icon name={group.boxId && selected.includes(group.boxId) ? 'check' : 'plus'} size={20}/>}</button>)}</div></section>}
      <span className="sr-only" role="status" aria-live="polite">{status}</span>
      <p className="recipient-separate-note"><Icon name="lock" size={16} />Each box receives a separate conversation. Recipients don’t see who else you chose.</p>
    </fieldset>
  );
}
