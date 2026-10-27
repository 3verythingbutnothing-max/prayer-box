import { useId, useRef, useState } from "react";
import type { BoxId, Viewer } from "../domain";
import { findPrayerRecipients, recipientNames } from "../recipients";
import { Icon, PrayerBoxMark } from "../ui";
import "../recipient-picker.css";

export default function RecipientPicker({
  selected, onChange, viewer, friends, mariaVisible = true, blocked = [],
}: {
  selected: BoxId[];
  onChange: (ids: BoxId[]) => void;
  viewer: Viewer;
  friends: readonly string[];
  mariaVisible?: boolean;
  blocked?: readonly string[];
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const matches = findPrayerRecipients(query, viewer, friends, { selected, mariaVisible, blocked });
  return (
    <fieldset className="recipient-picker">
      <legend>Where will this go?</legend>
      <p id={helpId} className="quiet-copy">Choose friends or search an @username. Prayer Box is here whenever you don’t have a particular box in mind.</p>
      <div className="recipient-chips" aria-label="Selected prayer boxes">
        {selected.map(id => (
          <span className="recipient-chip" key={id}>
            {id === "prayerbox" ? <PrayerBoxMark size={23} /> : <Icon name="box" size={18} />}
            {recipientNames[id]}
            <button type="button" aria-label={`Remove ${recipientNames[id]} recipient`} onClick={() => { onChange(selected.filter(box => box !== id)); input.current?.focus(); }}><Icon name="close" size={16} /></button>
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
          <button type="button" className="recipient-result" key={person.id} onClick={() => { onChange([...new Set([...selected, person.id])]); setQuery(""); input.current?.focus(); }}>
            <span className={`recipient-result-icon ${person.kind === "platform" ? "recipient-platform" : ""}`}>{person.kind === "platform" ? <PrayerBoxMark size={28} /> : <Icon name={person.kind === "organization" ? "people" : "box"} size={23} />}</span>
            <span><strong>{person.name}</strong><small>@{person.username} · {person.kind === "platform" ? "Prayer Box prayer team" : person.kind === "organization" ? "Church prayer community" : "Personal prayer box"}</small></span>
            <Icon name="plus" size={20} />
          </button>
        ))}
        {!matches.length && <p className="quiet-copy" role="status">{query.trim() ? "No available matching box in this demo. Try @maria, @daniel, @jordan or @prayerbox." : "Search an @username to find another available box."}</p>}
      </div>
      <p className="recipient-separate-note"><Icon name="lock" size={16} />Each box receives a separate conversation. Recipients don’t see who else you chose.</p>
    </fieldset>
  );
}
