import MoodboardPreview from '../moodboard/MoodboardPreview';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { FiCalendar, FiChevronLeft, FiChevronRight, FiClock, FiPlus, FiMessageCircle, FiUsers, FiCheck, FiArrowUpRight, FiSliders, FiInbox, FiSearch, FiSend, FiX } from 'react-icons/fi';
import FocusDialog from '../FocusDialog';
import type { SceneData } from '../types';
import { addMessage, addTimeOff, clock, dateKey, fromDateKey, id, minutes, money, prettyDate, saveAvailability, saveBooking, saveClient, SERVICES, shiftDate, slotIssue, STATUS_LABEL, weekStart, when, type ArtistData, type Availability, type Booking, type BookingStatus, type Client } from './model';
import { artistStorageKey, loadArtistData, persistArtistData } from './storage';
import './artist.css';

type Tab = 'calendar' | 'requests' | 'clients' | 'messages' | 'availability';
type Props = { owner: string; scenes: SceneData[]; onOpenProject: (scene: SceneData) => void; initialBookingId?: string; onClientSpace?: (bookingId: string) => void };
const tabs: { id: Tab; label: string; icon: typeof FiCalendar }[] = [
  { id: 'calendar', label: 'Calendar', icon: FiCalendar }, { id: 'requests', label: 'Requests', icon: FiInbox },
  { id: 'clients', label: 'Clients', icon: FiUsers }, { id: 'messages', label: 'Messages', icon: FiMessageCircle },
  { id: 'availability', label: 'Availability', icon: FiSliders },
];
const blankClient = (): Client => ({ id: id(), name: '', email: '', phone: '', notes: '' });
const blankBooking = (date: string, clientId = '', requested = false): Booking => ({ id: id(), clientId, title: '', service: 'Tattoo session', date, time: '10:00', duration: 120, status: requested ? 'requested' : 'confirmed', price: 0, deposit: 0, depositPaid: false, brief: '', notes: '', projectId: '' });
const initials = (name: string) => name.split(' ').map(n => n[0]).slice(0, 2).join('');
function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`artist-field${wide ? ' artist-field--wide' : ''}`}><span>{label}</span>{children}</label>;
}
function Status({ value }: { value: BookingStatus }) { return <span className={`artist-status artist-status--${value}`}><span aria-hidden />{STATUS_LABEL[value]}</span>; }

export default function ArtistPanel({ owner, scenes, onOpenProject, initialBookingId, onClientSpace }: Props) {
  const [loaded, setLoaded] = useState<{ data: ArtistData | null; error: string }>(() => {
    try { return { data: loadArtistData(owner), error: '' }; } catch (e) { return { data: null, error: e instanceof Error ? e.message : 'Could not open the artist workspace.' }; }
  });
  const dataRef = useRef(loaded.data);
  const data = loaded.data;
  const [tab, setTab] = useState<Tab>('calendar');
  const [selectedDate, setSelectedDate] = useState(() => data?.bookings.filter(b => b.status === 'confirmed' && b.date >= dateKey()).sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? dateKey());
  const [booking, setBooking] = useState<Booking | null>(() => data?.bookings.find(b => b.id === initialBookingId) ?? null);
  const [clientPreview, setClientPreview] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [conversation, setConversation] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [includeClosed, setIncludeClosed] = useState(false);
  const reload = () => {
    try { const fresh = loadArtistData(owner); dataRef.current = fresh; setLoaded({ data: fresh, error: '' }); setError(''); }
    catch (e) { setLoaded({ data: null, error: e instanceof Error ? e.message : 'Could not read your workspace.' }); }
  };
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== artistStorageKey(owner)) return;
      try { const fresh = loadArtistData(owner); dataRef.current = fresh; setLoaded({ data: fresh, error: '' }); }
      catch { setLoaded({ data: null, error: 'The saved workspace could not be read. Your data has been kept.' }); }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [owner]);
  const commit = (change: (current: ArtistData) => ArtistData, success: string) => {
    const current = dataRef.current;
    if (!current) throw new Error('Reload the artist workspace before saving.');
    const saved = persistArtistData(owner, change(current), current.revision);
    dataRef.current = saved;
    setLoaded({ data: saved, error: '' }); setError(''); setNotice(success);
  };
  const safeCommit = (change: (current: ArtistData) => ArtistData, success: string) => {
    try { commit(change, success); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Please try again.'); }
  };
  const openConversation = (clientId: string) => {
    setConversation(clientId); setTab('messages');
    if (dataRef.current?.messages.some(m => m.clientId === clientId && !m.read)) safeCommit(d => ({ ...d, messages: d.messages.map(m => m.clientId === clientId ? { ...m, read: true } : m) }), 'Conversation opened.');
  };
  if (!data) return <section className="artist-panel"><h1>Artist workspace</h1><p role="alert">{loaded.error}</p><button className="focus-primary" onClick={reload}>Reload workspace</button></section>;
  const requests = data.bookings.filter(b => b.status === 'requested').sort((a, b) => when(a).getTime() - when(b).getTime());
  const unread = data.messages.filter(m => m.from === 'client' && !m.read).length;
  const week = weekStart(selectedDate), days = Array.from({ length: 7 }, (_, i) => shiftDate(week, i));
  const scheduled = data.bookings.filter(b => b.status === 'confirmed' || b.status === 'completed');
  const thisWeek = scheduled.filter(b => days.includes(b.date));
  const dayBookings = data.bookings.filter(b => b.date === selectedDate && (includeClosed ? b.status !== 'requested' : b.status === 'confirmed' || b.status === 'completed')).sort((a, b) => a.time.localeCompare(b.time));
  const deposits = data.bookings.filter(b => b.status === 'confirmed' && !b.depositPaid).reduce((sum, b) => sum + b.deposit, 0);
  const findClient = (clientId: string) => data.clients.find(c => c.id === clientId);
  const filteredClients = data.clients.filter(c => `${c.name} ${c.email}`.toLowerCase().includes(search.trim().toLowerCase()));
  const chosenClient = findClient(conversation ?? '') ?? data.clients[0];
  const newAppointment = (clientId = '') => { setClientPreview(false); setBooking(blankBooking(selectedDate < dateKey() ? shiftDate(dateKey(), 1) : selectedDate, clientId)); };
  return <section className="artist-panel" aria-label="Artist workspace">
    <header className="artist-heading">
      <div><p className="focus-eyebrow">The work around the artwork</p><h1>Your artist desk.</h1><p>A little less admin. More time for the ink.</p></div>
      <button className="focus-primary" onClick={() => newAppointment()}><FiPlus aria-hidden />New appointment</button>
    </header>
    <div className="artist-demo-note"><span><strong>Demo workspace</strong> · Fictional clients. Changes stay on this device; messages and bookings are not sent.</span><button onClick={() => { setClientPreview(true); setBooking(blankBooking(shiftDate(dateKey(), 2), '', true)); }}>Try client request <FiArrowUpRight aria-hidden /></button></div>
    <nav className="artist-tabs" aria-label="Artist desk sections">{tabs.map(({ id: tabId, label, icon: Icon }) => <button key={tabId} aria-current={tab === tabId ? 'page' : undefined} onClick={() => { setTab(tabId); setSearch(''); setNotice(''); }}><Icon aria-hidden />{label}{(tabId === 'requests' && requests.length > 0 || tabId === 'messages' && unread > 0) && <span className="artist-count">{tabId === 'requests' ? requests.length : unread}</span>}</button>)}</nav>
    {error && <div className="artist-feedback artist-feedback--error" role="alert">{error}<button onClick={reload}>Reload workspace</button></div>}
    {notice && <div className="artist-feedback" role="status"><FiCheck aria-hidden />{notice}<button aria-label="Dismiss update" onClick={() => setNotice('')}><FiX /></button></div>}

    {tab === 'calendar' && <>
      <div className="artist-stats">
        <button onClick={() => setTab('requests')}><span>Waiting for you <FiInbox aria-hidden /></span><strong>{requests.length.toString().padStart(2, '0')}</strong><small>Appointment requests <FiArrowUpRight aria-hidden /></small></button>
        <div><span>On the calendar <FiCalendar aria-hidden /></span><strong>{thisWeek.length.toString().padStart(2, '0')}</strong><small>{thisWeek.reduce((sum, b) => sum + b.duration, 0) / 60} hours scheduled this week</small></div>
        <div><span>Deposits to follow up <FiClock aria-hidden /></span><strong>{money(deposits)}</strong><small>Recorded manually · no payments collected</small></div>
      </div>
      <div className="artist-calendar-grid">
        <section className="artist-card artist-agenda">
          <div className="artist-section-heading"><div><p className="focus-eyebrow">Your schedule</p><h2>{fromDateKey(selectedDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2></div><div className="artist-inline"><button className="artist-button" onClick={() => setSelectedDate(dateKey())}>Today</button><button className="artist-icon" aria-label="Previous week" onClick={() => setSelectedDate(shiftDate(selectedDate, -7))}><FiChevronLeft /></button><button className="artist-icon" aria-label="Next week" onClick={() => setSelectedDate(shiftDate(selectedDate, 7))}><FiChevronRight /></button></div></div>
          <div className="artist-week" role="group" aria-label="Choose a day">{days.map(day => <button key={day} aria-pressed={day === selectedDate} aria-label={prettyDate(day)} className={day === dateKey() ? 'is-today' : ''} onClick={() => setSelectedDate(day)}><span>{fromDateKey(day).toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{fromDateKey(day).getDate()}</strong><i aria-hidden className={scheduled.some(b => b.date === day) ? 'has-session' : ''} /></button>)}</div>
          <div className="artist-day-heading"><h3>{prettyDate(selectedDate)}</h3><label><input type="checkbox" checked={includeClosed} onChange={e => setIncludeClosed(e.target.checked)} />Show cancelled</label></div>
          <div className="artist-agenda-list">{dayBookings.map(b => <button className="artist-appointment" key={b.id} onClick={() => { setClientPreview(false); setBooking(b); }}><span className="artist-appointment-time"><strong>{b.time}</strong><small>{clock(minutes(b.time) + b.duration)}</small></span><span className="artist-appointment-copy"><strong>{b.title}</strong><span>{findClient(b.clientId)?.name} · {b.service}</span><small>{b.duration} min{b.deposit > 0 ? ` · Deposit ${b.depositPaid ? 'received' : 'pending'}` : ''}</small></span><Status value={b.status} /><FiChevronRight aria-hidden /></button>)}
            {data.timeOff.filter(t => t.date === selectedDate).map(t => <div className="artist-time-off" key={t.id}><FiClock aria-hidden /><div><strong>{t.label}</strong><span>{t.start}–{t.end} · Blocked time</span></div></div>)}
            {dayBookings.length === 0 && <div className="artist-empty"><FiCalendar aria-hidden /><h3>{data.availability.days.includes(fromDateKey(selectedDate).getDay()) ? 'Room for a new idea.' : 'A day away from the studio.'}</h3><p>{data.availability.days.includes(fromDateKey(selectedDate).getDay()) ? 'No appointments scheduled for this day.' : 'This day is closed in your availability.'}</p><button className="artist-button" onClick={() => newAppointment()}>Add an appointment</button></div>}
          </div><p className="artist-timezone">Times in {Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ')} · {data.availability.buffer} min between sessions</p>
        </section>
        <aside className="artist-card artist-request-peek"><div className="artist-section-heading"><h2>New possibilities</h2><span className="artist-count">{requests.length}</span></div><p className="artist-muted">A conversation before a commitment.</p>{requests.slice(0, 3).map(b => <button key={b.id} className="artist-request-mini" onClick={() => { setClientPreview(false); setBooking(b); }}><span className="artist-avatar">{initials(findClient(b.clientId)?.name ?? '?')}</span><span><strong>{findClient(b.clientId)?.name}</strong><small>{b.title}</small><small>{prettyDate(b.date)} · {b.time}</small></span><FiArrowUpRight aria-hidden /></button>)}{!requests.length && <p className="artist-muted">You're all caught up.</p>}<button className="artist-button" onClick={() => setTab('requests')}>View all requests <FiArrowUpRight aria-hidden /></button><div className="artist-tip"><span className="focus-eyebrow">Made for your process</span><p>Link a tattoo project to an appointment and have the placement ready when your client arrives.</p></div></aside>
      </div>
    </>}

    {tab === 'requests' && <section className="artist-card"><div className="artist-section-heading"><div><h2>Let’s make it happen.</h2><p className="artist-muted">Review the idea, agree on a time, then confirm. Requests do not reserve a slot.</p></div><span className="artist-count">{requests.length} pending</span></div><div className="artist-request-list">{requests.map(b => <article key={b.id} className="artist-request"><div className="artist-request-person"><span className="artist-avatar">{initials(findClient(b.clientId)?.name ?? '?')}</span><div><h3>{b.title}</h3><p>{findClient(b.clientId)?.name} · {b.service}</p></div><Status value={b.status} /></div><p className="artist-brief">{b.brief || 'No brief added yet.'}</p><p className="artist-muted"><FiCalendar aria-hidden /> {prettyDate(b.date)} at {b.time} · {b.duration} min requested</p>{slotIssue(data, b) && <p className="artist-slot-warning">Adjust the preferred time before confirming: {slotIssue(data, b)}</p>}<div className="artist-inline"><button className="focus-primary" onClick={() => { setClientPreview(false); setBooking(b); }}>Review request <FiArrowUpRight aria-hidden /></button><button className="artist-button" onClick={() => openConversation(b.clientId)}><FiMessageCircle aria-hidden />Message</button></div></article>)}</div>{!requests.length && <div className="artist-empty"><FiCheck /><h3>All caught up.</h3><p>New requests will appear here. Try a client request to test the flow.</p></div>}</section>}

    {tab === 'clients' && <section className="artist-card"><div className="artist-section-heading"><div><h2>The people behind the pieces.</h2><p className="artist-muted">Contact details, private notes and appointment history.</p></div><button className="artist-button" onClick={() => setEditingClient(blankClient())}><FiPlus aria-hidden />Add client</button></div><label className="artist-search"><FiSearch aria-hidden /><input type="search" aria-label="Search clients" placeholder="Search name or email" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="artist-client-grid">{filteredClients.map(c => <article className="artist-client-card" key={c.id}><div className="artist-inline"><span className="artist-avatar">{initials(c.name)}</span><div><h3>{c.name}</h3><p>{c.email}</p></div></div><p className="artist-client-notes">{c.notes || 'No private notes yet.'}</p><small>{data.bookings.filter(b => b.clientId === c.id && b.status === 'completed').length} completed · {data.bookings.filter(b => b.clientId === c.id && b.status === 'confirmed').length} scheduled</small><div className="artist-inline"><button className="artist-button" onClick={() => setEditingClient(c)}>View client</button><button className="artist-icon" aria-label={`Message ${c.name}`} onClick={() => openConversation(c.id)}><FiMessageCircle /></button><button className="artist-icon" aria-label={`Book ${c.name}`} onClick={() => newAppointment(c.id)}><FiPlus /></button></div></article>)}</div>{!filteredClients.length && <p className="artist-empty">No clients match your search.</p>}</section>}

    {tab === 'messages' && <section className="artist-card artist-inbox"><div className="artist-conversations"><h2>Conversations</h2><p className="artist-muted">Demo messages · nothing is sent</p>{data.clients.map(c => { const thread = data.messages.filter(m => m.clientId === c.id); const count = thread.filter(m => !m.read && m.from === 'client').length; return <button key={c.id} aria-pressed={c.id === chosenClient?.id} onClick={() => openConversation(c.id)}><span className="artist-avatar">{initials(c.name)}</span><span><strong>{c.name}</strong><small>{thread.at(-1)?.text ?? 'Start a conversation'}</small></span>{count > 0 && <span className="artist-count">{count}</span>}</button>; })}</div>{chosenClient ? <Conversation onProject={onClientSpace} key={chosenClient.id} client={chosenClient} messages={data.messages.filter(m => m.clientId === chosenClient.id)} onBook={() => newAppointment(chosenClient.id)} onSend={text => commit(d => addMessage(d, chosenClient.id, text), 'Message saved in this demo. Nothing was sent.')} onClientReply={text => commit(d => addMessage(d, chosenClient.id, text, 'client'), 'Client reply added to the demo.')} /> : <p>Add a client to start a conversation.</p>}</section>}

    {tab === 'availability' && <AvailabilityPanel key={data.revision} data={data} onSave={value => commit(d => saveAvailability(d, value), 'Availability saved for new bookings. Existing appointments stay in place.')} onBlock={value => commit(d => addTimeOff(d, value), 'Time blocked on your calendar.')} onRemove={timeOffId => safeCommit(d => ({ ...d, timeOff: d.timeOff.filter(t => t.id !== timeOffId) }), 'Blocked time removed.')} />}

    {booking && <AppointmentForm key={booking.id + String(clientPreview)} initial={booking} onClientSpace={onClientSpace ? () => onClientSpace(booking.id) : undefined} data={data} scenes={scenes} clientPreview={clientPreview} onClose={() => setBooking(null)} onProject={scene => { setBooking(null); onOpenProject(scene); }} onMessage={() => { openConversation(booking.clientId); setBooking(null); }} onSave={(value, newClient) => {
      commit(current => {
        let next = newClient ? saveClient(current, newClient) : current;
        next = saveBooking(next, value);
        if (clientPreview) next = addMessage(next, value.clientId, `Appointment request: ${value.title}. Preferred time: ${prettyDate(value.date)}, ${value.time}. My brief is in the booking request.`, 'client');
        return next;
      }, clientPreview ? 'Request added to your inbox. Review it in Requests.' : value.status === 'confirmed' ? 'Appointment confirmed in this demo.' : `Appointment ${STATUS_LABEL[value.status].toLowerCase()} and saved.`);
      setBooking(null); setSelectedDate(value.date); if (clientPreview) setTab('requests');
    }} />}
    {editingClient && <ClientForm client={editingClient} bookings={data.bookings.filter(b => b.clientId === editingClient.id)} onClose={() => setEditingClient(null)} onBooking={b => { setEditingClient(null); setClientPreview(false); setBooking(b); }} onSave={value => { commit(d => saveClient(d, value), 'Client details saved.'); setEditingClient(null); }} />}
  </section>;
}

function AppointmentForm({ initial, data, scenes, clientPreview, onClose, onSave, onMessage, onProject, onClientSpace }: {
  onClientSpace?: () => void; initial: Booking; data: ArtistData; scenes: SceneData[]; clientPreview: boolean; onClose: () => void;
  onSave: (value: Booking, newClient?: Client) => void; onMessage: () => void; onProject: (scene: SceneData) => void;
}) {
  const existing = data.bookings.some(b => b.id === initial.id);
  const [value, setValue] = useState(initial);
  const [newClient, setNewClient] = useState(blankClient);
  const [creatingClient, setCreatingClient] = useState(clientPreview);
  const [error, setError] = useState('');
  const update = <K extends keyof Booking>(key: K, next: Booking[K]) => setValue(previous => ({ ...previous, [key]: next }));
  const save = (status: BookingStatus) => {
    setError('');
    try { onSave({ ...value, status, clientId: creatingClient ? newClient.id : value.clientId }, creatingClient ? newClient : undefined); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save this appointment.'); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = clientPreview ? 'requested' : (button?.value || value.status) as BookingStatus;
    save(status);
  };
  const linked = scenes.find(s => s.id === value.projectId);
  const canComplete = initial.status === 'confirmed' && when(initial).getTime() + initial.duration * 60000 <= Date.now();
  return <FocusDialog title={clientPreview ? 'Try a client request' : existing ? 'Appointment details' : 'New appointment'} wide onClose={onClose}>
    <form className="artist-form" onSubmit={submit}>
      <p className="artist-muted">{clientPreview ? 'Step into the client’s shoes. Submit an idea and preferred time, then review it from the artist desk. This is a local preview.' : 'Plan the session, keep the brief close, and link the design. Changes are saved in this demo only.'}</p>
      {existing && <div className="artist-inline artist-form-status"><Status value={initial.status} />{onClientSpace && <button type="button" className="artist-button" onClick={onClientSpace}>Open client project space <FiArrowUpRight aria-hidden /></button>}<button type="button" className="artist-button" onClick={onMessage}><FiMessageCircle aria-hidden />Conversation</button></div>}
      {value.moodboard && <MoodboardPreview board={value.moodboard} />}
      <div className="artist-form-grid">
        <Field label="Client" wide><select value={creatingClient ? '__new' : value.clientId} onChange={e => { setCreatingClient(e.target.value === '__new'); if (e.target.value !== '__new') update('clientId', e.target.value); }} required><option value="">Select a client</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="__new">+ New client</option></select></Field>
        {creatingClient && <><Field label="Client name"><input value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} required maxLength={100} autoComplete="off" /></Field><Field label="Client email"><input type="email" value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })} required maxLength={254} autoComplete="off" placeholder="For the demo, use an example address" /></Field></>}
        <Field label="Design / appointment name" wide><input value={value.title} onChange={e => update('title', e.target.value)} required maxLength={120} placeholder="e.g. Botanical forearm · session one" /></Field>
        <Field label="Session type"><select value={value.service} onChange={e => update('service', e.target.value as Booking['service'])}>{SERVICES.map(service => <option key={service}>{service}</option>)}</select></Field>
        <Field label="Duration (minutes)"><input type="number" min={15} max={480} step={15} value={value.duration} onChange={e => update('duration', Number(e.target.value))} required /></Field>
        <Field label={clientPreview ? 'Preferred date' : 'Date'}><input type="date" required value={value.date} onChange={e => update('date', e.target.value)} /></Field>
        <Field label={clientPreview ? 'Preferred time' : 'Start time'}><input type="time" required value={value.time} onChange={e => update('time', e.target.value)} /></Field>
        <Field label="Client brief" wide><textarea value={value.brief} onChange={e => update('brief', e.target.value)} rows={3} maxLength={4000} placeholder="The idea, placement, approximate size…" /></Field>
        {!clientPreview && <>
          <Field label="Total quote (€)"><input type="number" min={0} max={100000} step="0.01" value={value.price} onChange={e => update('price', Number(e.target.value))} required /></Field>
          <Field label="Deposit (€)"><input type="number" min={0} max={value.price} step="0.01" value={value.deposit} onChange={e => update('deposit', Number(e.target.value))} required /></Field>
          <label className="artist-check artist-field--wide"><input type="checkbox" checked={value.depositPaid} onChange={e => update('depositPaid', e.target.checked)} />Deposit received <small>Manual record only; no payment is processed.</small></label>
          <Field label="Linked tattoo project" wide><select value={value.projectId} onChange={e => update('projectId', e.target.value)}><option value="">No project linked yet</option>{value.projectId && !linked && <option value={value.projectId}>Previously linked project (unavailable)</option>}{scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Private artist notes" wide><textarea value={value.notes} onChange={e => update('notes', e.target.value)} rows={2} maxLength={4000} placeholder="Session plan, reference details, next steps…" /></Field>
        </>}
      </div>
      {error && <p className="artist-form-error" role="alert">{error}</p>}
      <p className="artist-muted">{clientPreview || value.status === 'requested' ? 'The artist confirms the appointment after reviewing the time and design.' : `Ends at ${Number.isFinite(value.duration) && value.time ? clock(minutes(value.time) + value.duration) : '—'}. Confirmed sessions include a ${data.availability.buffer}-minute turnaround.`}</p>
      <footer className="artist-form-actions">
        {existing && initial.status === 'confirmed' && <button type="button" className="artist-button artist-danger" onClick={() => save('cancelled')}>Cancel appointment</button>}
        {existing && initial.status === 'requested' && <button type="button" className="artist-button artist-danger" onClick={() => save('declined')}>Decline request</button>}
        {canComplete && <button type="button" className="artist-button" onClick={() => save('completed')}>Mark complete</button>}
        <button type="button" className="artist-button" onClick={onClose}>Close</button>
        {!clientPreview && existing && <button type="submit" className="artist-button" value={initial.status}>Save changes</button>}
        {clientPreview ? <button type="submit" className="focus-primary">Submit demo request <FiArrowUpRight aria-hidden /></button> : (!existing || initial.status === 'requested' || initial.status === 'cancelled' || initial.status === 'declined') && <button type="submit" className="focus-primary" value="confirmed">{existing && initial.status !== 'requested' ? 'Rebook appointment' : 'Confirm appointment'}<FiCheck aria-hidden /></button>}
      </footer>
      {linked && <button type="button" className="artist-project-link" onClick={() => onProject(linked)}>Open linked tattoo project <FiArrowUpRight aria-hidden /><small>Save appointment changes before opening the studio.</small></button>}
    </form>
  </FocusDialog>;
}

function ClientForm({ client, bookings, onClose, onSave, onBooking }: { client: Client; bookings: Booking[]; onClose: () => void; onSave: (client: Client) => void; onBooking: (b: Booking) => void }) {
  const [value, setValue] = useState(client), [error, setError] = useState('');
  return <FocusDialog title={client.name || 'New client'} onClose={onClose}><form className="artist-form" onSubmit={e => { e.preventDefault(); try { onSave(value); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.'); } }}><div className="artist-form-grid"><Field label="Name" wide><input value={value.name} required maxLength={100} onChange={e => setValue({ ...value, name: e.target.value })} /></Field><Field label="Email" wide><input type="email" value={value.email} required maxLength={254} onChange={e => setValue({ ...value, email: e.target.value })} /></Field><Field label="Phone (optional)" wide><input type="tel" value={value.phone} maxLength={50} onChange={e => setValue({ ...value, phone: e.target.value })} /></Field><Field label="Private artist notes" wide><textarea rows={3} value={value.notes} maxLength={4000} onChange={e => setValue({ ...value, notes: e.target.value })} /></Field></div>{error && <p role="alert" className="artist-form-error">{error}</p>}<footer className="artist-form-actions"><button type="button" className="artist-button" onClick={onClose}>Close</button><button className="focus-primary">Save client</button></footer></form>{bookings.length > 0 && <div className="artist-client-history"><h3>Appointment history</h3>{[...bookings].sort((a, b) => when(b).getTime() - when(a).getTime()).map(b => <button key={b.id} onClick={() => onBooking(b)}><span><strong>{b.title}</strong><small>{prettyDate(b.date)} · {b.time}</small></span><Status value={b.status} /></button>)}</div>}</FocusDialog>;
}

function Conversation({ client, messages, onBook, onSend, onClientReply, onProject }: { onProject?: (id: string) => void; client: Client; messages: ArtistData['messages']; onBook: () => void; onSend: (text: string) => void; onClientReply: (text: string) => void }) {
  const [text, setText] = useState(''), [error, setError] = useState(''), [asClient, setAsClient] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  return <div className="artist-thread"><header><div><h2>{client.name}</h2><p className="artist-muted">Discuss the idea. Agree on the next step.</p></div><button className="artist-icon" aria-label={`New appointment with ${client.name}`} onClick={onBook}><FiCalendar /></button></header><div className="artist-message-list" role="log" aria-label={`Conversation with ${client.name}`} aria-live="polite">{messages.length === 0 && <p className="artist-empty">Start the conversation with a hello.</p>}{messages.map(m => <div key={m.id} className={`artist-message artist-message--${m.from}`}><span>{m.from === 'artist' ? 'You' : client.name}</span><p>{m.text}</p>{m.bookingId && onProject && <button className="artist-button" onClick={() => onProject(m.bookingId!)}>Reply in project space <FiArrowUpRight aria-hidden /></button>}<time dateTime={m.at}>{new Date(m.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>)}<div ref={bottom} /></div><form className="artist-compose" onSubmit={e => { e.preventDefault(); try { (asClient ? onClientReply : onSend)(text); setText(''); setError(''); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save message.'); } }}><label htmlFor="artist-message-draft">{asClient ? `Demo reply from ${client.name}` : `Message to ${client.name}`}</label><textarea id="artist-message-draft" rows={3} value={text} required maxLength={4000} onChange={e => setText(e.target.value)} placeholder="Write a message…" />{error && <p role="alert" className="artist-form-error">{error}</p>}<div className="artist-compose-footer"><label className="artist-check"><input type="checkbox" checked={asClient} onChange={e => setAsClient(e.target.checked)} />Simulate client reply</label><button className="focus-primary" disabled={!text.trim()}><FiSend aria-hidden />{asClient ? 'Add client reply' : 'Save demo message'}</button></div></form></div>;
}

function AvailabilityPanel({ data, onSave, onBlock, onRemove }: { data: ArtistData; onSave: (v: Availability) => void; onBlock: (v: ArtistData['timeOff'][number]) => void; onRemove: (id: string) => void }) {
  const [value, setValue] = useState(data.availability), [error, setError] = useState('');
  const [block, setBlock] = useState({ id: id(), date: dateKey(), start: '12:00', end: '13:00', label: '' });
  const [blockError, setBlockError] = useState('');
  return <div className="artist-availability"><section className="artist-card"><h2>Make room for good work.</h2><p className="artist-muted">Set your usual hours and leave breathing room between sessions. These rules apply to new and rescheduled bookings; existing appointments stay in place.</p><form className="artist-form" onSubmit={e => { e.preventDefault(); try { onSave(value); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.'); } }}><fieldset><legend>Studio days</legend><div className="artist-open-days">{[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day}><input type="checkbox" checked={value.days.includes(day)} onChange={e => setValue({ ...value, days: e.target.checked ? [...value.days, day] : value.days.filter(d => d !== day) })} /><span>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}</span></label>)}</div></fieldset><div className="artist-form-grid"><Field label="Opens at"><input type="time" required value={value.start} onChange={e => setValue({ ...value, start: e.target.value })} /></Field><Field label="Closes at"><input type="time" required value={value.end} onChange={e => setValue({ ...value, end: e.target.value })} /></Field><Field label="Between sessions (minutes)" wide><input type="number" min={0} max={120} step={5} required value={value.buffer} onChange={e => setValue({ ...value, buffer: Number(e.target.value) })} /></Field></div>{error && <p role="alert" className="artist-form-error">{error}</p>}<button className="focus-primary">Save availability</button></form></section><section className="artist-card"><h2>Time for everything else.</h2><p className="artist-muted">Block a break, a day off or time to draw. Confirmed appointments cannot be blocked over.</p><form className="artist-form" onSubmit={e => { e.preventDefault(); try { onBlock(block); setBlockError(''); } catch (err) { setBlockError(err instanceof Error ? err.message : 'Could not block time.'); } }}><div className="artist-form-grid"><Field label="Block date" wide><input type="date" required value={block.date} onChange={e => setBlock({ ...block, date: e.target.value })} /></Field><Field label="Block from"><input type="time" required value={block.start} onChange={e => setBlock({ ...block, start: e.target.value })} /></Field><Field label="Block until"><input type="time" required value={block.end} onChange={e => setBlock({ ...block, end: e.target.value })} /></Field><Field label="Reason" wide><input value={block.label} required maxLength={100} placeholder="e.g. Drawing time" onChange={e => setBlock({ ...block, label: e.target.value })} /></Field></div>{blockError && <p role="alert" className="artist-form-error">{blockError}</p>}<button className="artist-button"><FiPlus aria-hidden />Block time</button></form><div className="artist-block-list">{data.timeOff.map(t => <div key={t.id}><span><strong>{t.label}</strong><small>{prettyDate(t.date)} · {t.start}–{t.end}</small></span><button className="artist-icon" aria-label={`Remove ${t.label} block`} onClick={() => onRemove(t.id)}><FiX /></button></div>)}</div></section></div>;
}
