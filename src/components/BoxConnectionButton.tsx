import { useId, useState } from 'react';
import { Icon, Modal } from '../ui';
import { useActionFeedback } from '../action-feedback';
import { disconnectPrayerConnection, requestPrayerConnection, visibleConnectionRequests, visibleManagedConnections } from '../prayer-events';
import type { EventContext, EventHost, PrayerConnection } from '../prayer-events';

export function BoxConnectionButton({ viewer, target, name, context, onChange, onNavigate }: {
  viewer: string; target: EventHost; name: string; context: EventContext;
  onChange: (connections: PrayerConnection[]) => void; onNavigate: (route: string) => void;
}) {
  const feedback = useActionFeedback();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const helpId = useId();
  const matches = (host: EventHost) => host.id === target.id && host.kind === target.kind;
  const active = visibleManagedConnections(context.connections, viewer, context).find(row => row.as.kind === 'person' && row.as.id === viewer && matches(row.other));
  const pending = visibleConnectionRequests(context.connections, viewer, context).find(row => row.as.kind === 'person' && row.as.id === viewer && matches(row.other));
  function connect() {
    feedback.prepare(); setError('');
    try { onChange(requestPrayerConnection(context.connections, viewer, target, context)); feedback.respond({tone:'success', title:'Request sent!', message:`${name} can accept or decline in My Church.`}); }
    catch (failure) { const message = failure instanceof Error ? failure.message : 'This connection is unavailable.'; setError(message); feedback.respond({tone:'info',title:message}); }
  }
  return <>
    <button className="button secondary box-connection-button" aria-describedby={helpId} onClick={() => active ? setConfirm(true) : pending ? onNavigate('church') : connect()}>
      {active ? 'Disconnect' : pending?.direction === 'outgoing' ? 'Request sent!' : pending ? 'Review connection request' : `Connect with ${name}`}
      <Icon name={active ? 'close' : pending ? 'check' : 'people'} size={18} />
    </button>
    <span className="sr-only" id={helpId}>Connecting shares your profile and requires acceptance. It does not attach any prayer, reveal an anonymous prayer, or change private prayer access.</span>
    {error && <span className="connection-action-error" role="status">{error}</span>}
    {confirm && active && <Modal title={`Disconnect from ${name}?`} onClose={() => setConfirm(false)}>
      <p>Are you sure you want to disconnect? Invitations from this connection will no longer appear.</p>
      <p>If you want to reconnect later, you will need to send a new connection request and {name} will need to accept it again. Group membership is managed separately.</p>
      <div className="form-actions"><button className="button secondary" onClick={() => setConfirm(false)}>Keep connection</button><button className="button" onClick={() => { feedback.prepare(); try { onChange(disconnectPrayerConnection(context.connections,active.connection.id,viewer,context)); setConfirm(false); feedback.respond({tone:'success',title:'Connection removed.'}); } catch(failure) {setError(failure instanceof Error ? failure.message : 'Please try again.');setConfirm(false);} }}>Disconnect <Icon name="check" /></button></div>
    </Modal>}
  </>;
}
