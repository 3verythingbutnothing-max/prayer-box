import { Icon } from '../ui';
import { hasMedia, mediaSummary } from '../media-draft';
import type { MediaDraftSnapshot } from '../media-draft';
import '../media-draft-preview.css';

/** Parent must authorize access before rendering; never exposes an original file. */
export function MediaDraftSummary({ snapshot, status = 'pending', heading = 'Attachments', showTranscript = true }: {
  snapshot: MediaDraftSnapshot;
  status?: 'draft' | 'pending' | 'approved';
  heading?: string;
  showTranscript?: boolean;
}) {
  if (!hasMedia(snapshot)) return null;
  return <section className={`media-draft-summary media-draft-summary-${status}`} aria-label={heading}>
    <div className="media-draft-heading"><h3><Icon name={snapshot.audio ? 'audio' : 'photo'} size={19}/>{heading}</h3><span className="media-preview-badge">Design preview</span></div>
    <p className="media-summary-status"><Icon name={status === 'approved' ? 'check' : 'lock'} size={17}/>{status === 'approved' ? 'Approved example' : status === 'draft' ? 'Draft preserved · not submitted' : 'Awaiting human review · not shared'}</p>
    <p>{mediaSummary(snapshot).replace(' · human review required', '')}</p>
    <p className="media-draft-help">Fictional attachments only. No photo file, recording, or playback is available.</p>
    {snapshot.audio && showTranscript && <details className="media-summary-transcript"><summary>Read the sample transcript</summary>{snapshot.audio.transcript.trim() ? <p>{snapshot.audio.transcript}</p> : <p>The sample transcript is not ready.</p>}</details>}
  </section>;
}

export default MediaDraftSummary;
