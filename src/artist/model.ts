import { validMoodboardSnapshot, type MoodboardSnapshot } from '../moodboard/model';
export type BookingStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled' | 'declined';
export type Service = 'Tattoo session' | 'Consultation' | 'Touch-up';
export type Client = { id: string; name: string; email: string; phone: string; notes: string };
export type Booking = {
  id: string; clientId: string; title: string; service: Service; date: string; time: string;
  duration: number; status: BookingStatus; price: number; deposit: number; depositPaid: boolean;
  brief: string; notes: string; projectId: string; moodboard?: MoodboardSnapshot;
};
export type Message = { id: string; clientId: string; from: 'artist' | 'client'; text: string; at: string; read: boolean };
export type Availability = { days: number[]; start: string; end: string; buffer: number };
export type TimeOff = { id: string; date: string; start: string; end: string; label: string };
export type ArtistData = {
  version: 1; revision: number; clients: Client[]; bookings: Booking[]; messages: Message[];
  availability: Availability; timeOff: TimeOff[];
};
export const SERVICES: Service[] = ['Tattoo session', 'Consultation', 'Touch-up'];
export const STATUS_LABEL: Record<BookingStatus, string> = { requested: 'Requested', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', declined: 'Declined' };
export const id = () => crypto.randomUUID();
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function fromDateKey(value: string) { return new Date(`${value}T12:00:00`); }
export function shiftDate(value: string, days: number) { const d = fromDateKey(value); d.setDate(d.getDate() + days); return dateKey(d); }
export function weekStart(value: string) { return shiftDate(value, -((fromDateKey(value).getDay() + 6) % 7)); }
export function minutes(time: string) { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
export function clock(value: number) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
export function when(booking: Pick<Booking, 'date' | 'time'>) { return new Date(`${booking.date}T${booking.time}:00`); }
export const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
export const prettyDate = (date: string) => fromDateKey(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(fromDateKey(value).getTime()) && dateKey(fromDateKey(value)) === value; }
function validTime(value: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const active = (b: Booking) => b.status === 'confirmed' || b.status === 'completed';

export function slotIssue(data: ArtistData, booking: Booking): string | null {
  const start = minutes(booking.time), end = start + booking.duration;
  if (!data.availability.days.includes(fromDateKey(booking.date).getDay())) return 'The studio is closed on this day. Choose another date or update availability.';
  if (start < minutes(data.availability.start) || end > minutes(data.availability.end)) return `This session must fit within studio hours (${data.availability.start}–${data.availability.end}).`;
  const conflict = data.bookings.find(b => b.id !== booking.id && b.date === booking.date && active(b)
    && start < minutes(b.time) + b.duration + data.availability.buffer && minutes(b.time) < end + data.availability.buffer);
  if (conflict) return `This overlaps “${conflict.title}” or its ${data.availability.buffer}-minute turnaround. Choose another time.`;
  const blocked = data.timeOff.find(t => t.date === booking.date && start < minutes(t.end) && minutes(t.start) < end);
  if (blocked) return `This time is blocked for ${blocked.label}. Choose another time.`;
  return null;
}

export function saveClient(data: ArtistData, client: Client): ArtistData {
  const next = { ...client, name: client.name.trim(), email: client.email.trim().toLowerCase(), phone: client.phone.trim(), notes: client.notes.trim() };
  requireThat(next.name.length > 0 && next.name.length <= 100, 'Add a client name (up to 100 characters).');
  requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email) && next.email.length <= 254, 'Add a valid email address.');
  requireThat(!data.clients.some(c => c.id !== next.id && c.email.toLowerCase() === next.email), 'A client with this email already exists. Select them from your client list.');
  requireThat(next.notes.length <= 4000 && next.phone.length <= 50, 'Keep notes under 4,000 characters and phone numbers under 50.');
  return { ...data, clients: data.clients.some(c => c.id === next.id) ? data.clients.map(c => c.id === next.id ? next : c) : [...data.clients, next] };
}

export function saveBooking(data: ArtistData, booking: Booking, now = new Date()): ArtistData {
  const next = { ...booking, title: booking.title.trim(), brief: booking.brief.trim(), notes: booking.notes.trim() };
  requireThat(data.clients.some(c => c.id === next.clientId), 'Select a client first.');
  requireThat(next.moodboard === undefined || validMoodboardSnapshot(next.moodboard), 'Check the attached moodboard.');
  requireThat(next.title.length > 0 && next.title.length <= 120, 'Add a design or appointment name (up to 120 characters).');
  requireThat(SERVICES.includes(next.service) && Object.hasOwn(STATUS_LABEL, next.status), 'Choose a valid appointment type and status.');
  requireThat(validDate(next.date) && validTime(next.time), 'Choose a valid date and start time.');
  requireThat(Number.isInteger(next.duration) && next.duration >= 15 && next.duration <= 480 && next.duration % 15 === 0, 'Duration must be 15–480 minutes, in steps of 15.');
  requireThat(minutes(next.time) + next.duration <= 1440, 'A session must finish on the same day.');
  requireThat([next.price, next.deposit].every(n => Number.isFinite(n) && n >= 0 && n <= 100000) && next.deposit <= next.price, 'The deposit must be between zero and the total quote.');
  requireThat(next.brief.length <= 4000 && next.notes.length <= 4000, 'Keep each set of notes under 4,000 characters.');
  const old = data.bookings.find(b => b.id === next.id);
  const changedSlot = !old || old.date !== next.date || old.time !== next.time || old.duration !== next.duration || old.status !== next.status;
  if (changedSlot && (next.status === 'requested' || next.status === 'confirmed')) {
    requireThat(when(next) > now, 'Choose a future date and time.');
    if (next.status === 'confirmed') { const issue = slotIssue(data, next); requireThat(!issue, issue ?? 'Time unavailable.'); }
  }
  if (next.status === 'completed' && old?.status !== 'completed') {
    requireThat(old?.status === 'confirmed', 'Only a confirmed appointment can be completed.');
    requireThat(when(next).getTime() + next.duration * 60000 <= now.getTime(), 'Mark this appointment complete after the session has ended.');
  }
  return { ...data, bookings: old ? data.bookings.map(b => b.id === next.id ? next : b) : [...data.bookings, next] };
}

export function saveAvailability(data: ArtistData, value: Availability): ArtistData {
  requireThat(value.days.length > 0 && value.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6), 'Choose at least one open day.');
  requireThat(validTime(value.start) && validTime(value.end) && minutes(value.start) < minutes(value.end), 'Closing time must be after opening time.');
  requireThat(Number.isInteger(value.buffer) && value.buffer >= 0 && value.buffer <= 120, 'Turnaround must be between 0 and 120 minutes.');
  return { ...data, availability: { ...value, days: [...new Set(value.days)] } };
}
export function addTimeOff(data: ArtistData, value: TimeOff): ArtistData {
  requireThat(validDate(value.date) && validTime(value.start) && validTime(value.end) && minutes(value.start) < minutes(value.end), 'Choose a valid date and an end time after the start.');
  requireThat(value.label.trim().length > 0 && value.label.length <= 100, 'Add a short reason for blocking this time.');
  requireThat(!data.bookings.some(b => b.date === value.date && active(b) && minutes(b.time) < minutes(value.end) && minutes(value.start) < minutes(b.time) + b.duration), 'An appointment is already confirmed here. Reschedule it before blocking this time.');
  return { ...data, timeOff: [...data.timeOff, { ...value, label: value.label.trim() }] };
}
export function addMessage(data: ArtistData, clientId: string, text: string, from: Message['from'] = 'artist'): ArtistData {
  requireThat(data.clients.some(c => c.id === clientId), 'Choose a client.');
  requireThat(text.trim().length > 0 && text.trim().length <= 4000, 'Write a message of up to 4,000 characters.');
  return { ...data, messages: [...data.messages, { id: id(), clientId, text: text.trim(), from, at: new Date().toISOString(), read: from === 'artist' }] };
}

export function demoData(now = new Date()): ArtistData {
  const today = dateKey(now);
  const workingDate = (offset: number) => { const day = shiftDate(today, offset); return fromDateKey(day).getDay() === 0 ? shiftDate(day, 1) : day; };
  const clients: Client[] = [
    { id: 'sample-maya', name: 'Maya Ellis', email: 'maya@example.invalid', phone: '', notes: 'Likes botanical linework. Discuss how the design follows the forearm.' },
    { id: 'sample-noah', name: 'Noah Rivera', email: 'noah@example.invalid', phone: '', notes: 'Planning a geometric sleeve over several sessions.' },
    { id: 'sample-ava', name: 'Ava Chen', email: 'ava@example.invalid', phone: '', notes: 'First tattoo. Allow time to walk through placement together.' },
    { id: 'sample-luca', name: 'Luca Martin', email: 'luca@example.invalid', phone: '', notes: 'Returning client. Prefers morning appointments.' },
  ];
  const base = { service: 'Tattoo session' as Service, duration: 120, price: 320, deposit: 80, depositPaid: false, notes: '', projectId: '' };
  return {
    version: 1, revision: 0, clients, availability: { days: [1, 2, 3, 4, 5, 6], start: '10:00', end: '18:00', buffer: 30 }, timeOff: [],
    bookings: [
      { ...base, id: 'sample-b1', clientId: 'sample-maya', title: 'Botanical forearm', date: workingDate(1), time: '10:00', status: 'confirmed', depositPaid: true, brief: 'Fine-line leaves curving along the outside of my forearm.' },
      { ...base, id: 'sample-b2', clientId: 'sample-noah', title: 'Sleeve · first session', date: workingDate(1), time: '14:00', duration: 180, price: 450, deposit: 100, status: 'confirmed', brief: 'Build up a circular pattern from the upper arm.' },
      { ...base, id: 'sample-b3', clientId: 'sample-ava', title: 'A little sun', service: 'Consultation', date: workingDate(3), time: '11:00', duration: 30, price: 0, deposit: 0, status: 'requested', brief: 'I would love a small sun on my ankle. Can we try a few placements first?' },
      { ...base, id: 'sample-b4', clientId: 'sample-luca', title: 'Ornamental armband', date: workingDate(4), time: '10:00', status: 'requested', brief: 'A seamless band around the right forearm, about 6 cm tall.' },
      { ...base, id: 'sample-b5', clientId: 'sample-maya', title: 'Placement consultation', service: 'Consultation', date: shiftDate(today, -3), time: '10:00', duration: 30, price: 0, deposit: 0, status: 'completed', brief: 'Review the botanical composition.' },
    ],
    messages: [
      { id: 'sample-m1', clientId: 'sample-ava', from: 'client', text: 'Hi! This will be my first tattoo. Could we look at the size together before we book the session?', at: now.toISOString(), read: false },
      { id: 'sample-m2', clientId: 'sample-luca', from: 'client', text: 'I’ve sent a request for the armband. A morning works best for me.', at: now.toISOString(), read: false },
      { id: 'sample-m3', clientId: 'sample-maya', from: 'artist', text: 'Your session is confirmed. We’ll check the placement together when you arrive.', at: now.toISOString(), read: true },
    ],
  };
}
