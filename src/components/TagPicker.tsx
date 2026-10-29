import { useState } from 'react';
import { Icon } from '../ui';
import { normalizeTag, tagTone, tagTones } from '../private-tags';
import type { PrayerTag, TagTone } from '../private-tags';
import { useActionFeedback } from '../action-feedback';
import '../private-tags.css';

export function TagChips({ tags, onRemove, onSearch }: { tags: readonly PrayerTag[]; onRemove?: (tag: PrayerTag) => void; onSearch?: (tag: PrayerTag) => void }) {
  return <div className="prayer-tag-list">{tags.map(tag=>onRemove ? <button type="button" className={`prayer-tag tag-${tag.tone}`} key={tag.label} aria-label={`Remove ${tag.label} tag`} onClick={()=>onRemove(tag)}>#{tag.label}<Icon name="close" size={14}/></button> : onSearch ? <button type="button" className={`prayer-tag tag-${tag.tone}`} key={tag.label} onClick={()=>onSearch(tag)}>#{tag.label}</button> : <span className={`prayer-tag tag-${tag.tone}`} key={tag.label}>#{tag.label}</span>)}</div>;
}
export function TagPicker({ value, catalog, onChange }: { value: PrayerTag[]; catalog: readonly PrayerTag[]; onChange: (tags: PrayerTag[]) => void }) {
  const [input,setInput] = useState('');
  const [tone,setTone] = useState<TagTone | null>(null);
  const [error,setError] = useState('');
  const feedback = useActionFeedback();
  const needle = input.trim().replace(/^#+/,'').toLowerCase();
  const ideas = ['financial','health','spiritual','family','love'].map(label=>({label,tone:tagTone(label)}));
  const suggestions = [...new Map([...ideas,...catalog].map(tag=>[tag.label,tag])).values()].filter(tag=>!value.some(current=>current.label===tag.label)&&tag.label.includes(needle)).slice(0,8);
  const add = (label = input, chosen?: TagTone) => {
    try {
      const clean = normalizeTag(label);
      if (value.some(tag=>tag.label===clean)) throw new Error('This tag is already added.');
      if (value.length>=8) throw new Error('Add up to 8 tags per request.');
      onChange([...value,{label:clean,tone:chosen ?? tone ?? catalog.find(tag=>tag.label===clean)?.tone ?? tagTone(clean)}]);
      setInput('');setTone(null);setError('');
      feedback.prepare();feedback.respond({tone:'success',title:'Tag added.'});
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please check this tag.'); }
  };
  return <fieldset className="private-tag-picker"><legend>Tags <span className="quiet-copy">· only you</span></legend>
    <TagChips tags={value} onRemove={tag=>{onChange(value.filter(current=>current.label!==tag.label));feedback.prepare();feedback.respond({tone:'info',title:'Tag removed.'});}}/>
    <div className="tag-input-row"><input aria-label="Add a private tag" value={input} maxLength={40} placeholder="Add a tag" onChange={event=>{setInput(event.target.value);setError('');}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();add();}}}/><button type="button" className="button secondary compact" disabled={!input.trim()||value.length>=8} onClick={()=>add()}>Add tag</button></div>
    {input.trim() && <div className="tag-color-options" role="group" aria-label="Tag color">{tagTones.map(color=><button type="button" key={color} className={`tag-color tag-${color}`} aria-label={`${color} tag color`} aria-pressed={(tone ?? tagTone(needle))===color} onClick={()=>setTone(color)}>{(tone ?? tagTone(needle))===color&&<Icon name="check" size={16}/>}</button>)}</div>}
    {suggestions.length>0 && <div className="tag-suggestions" aria-label="Suggested tags">{suggestions.map(tag=><button type="button" className={`prayer-tag tag-${tag.tone}`} key={tag.label} disabled={value.length>=8} onClick={()=>add(tag.label,tag.tone)}>#{tag.label}</button>)}</div>}
    {error&&<p className="tag-error" role="alert">{error}</p>}
  </fieldset>;
}
