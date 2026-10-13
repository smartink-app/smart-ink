import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ stdin: { contents: "export * from './src/artist/model'; export * from './src/artist/storage';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const now = new Date(2026, 9, 9, 9), data = api.demoData(now);
const maya = data.bookings.find(b => b.id === 'sample-b1');
const pending = { ...maya, id: 'request', status: 'requested', depositPaid: false };

// Requests never consume capacity, but approval checks the exact slot and buffer.
const requested = api.saveBooking(data, pending, now);
assert.equal(requested.bookings.at(-1).status, 'requested');
assert.throws(() => api.saveBooking(requested, { ...pending, status: 'confirmed' }, now), /overlaps/);
assert.throws(() => api.saveBooking(data, { ...pending, status: 'confirmed', time: '12:15', duration: 30 }, now), /turnaround/);
const approved = api.saveBooking(data, { ...pending, status: 'confirmed', time: '12:30', duration: 60 }, now);
assert.equal(approved.bookings.at(-1).time, '12:30');
assert.equal(api.saveBooking(approved, { ...approved.bookings.at(-1), notes: 'Placement agreed' }, now).bookings.at(-1).notes, 'Placement agreed', 'Editing a booking excludes itself from conflicts');

// Booking constraints protect the calendar, including overnight and closed days.
assert.throws(() => api.saveBooking(data, { ...pending, status: 'confirmed', date: '2026-10-11' }, now), /closed/);
assert.throws(() => api.saveBooking(data, { ...pending, status: 'confirmed', time: '09:00' }, now), /studio hours/);
assert.throws(() => api.saveBooking(data, { ...pending, time: '23:30' }, now), /same day/);
assert.throws(() => api.saveBooking(data, { ...pending, date: '2026-02-30' }, now), /valid date/);
assert.throws(() => api.saveBooking(data, { ...pending, date: '2026-10-08' }, now), /future/);
assert.throws(() => api.saveBooking(data, { ...pending, deposit: 999 }, now), /deposit/);
assert.throws(() => api.saveBooking(data, { ...pending, duration: -15 }, now), /Duration/);
assert.throws(() => api.saveBooking(data, { ...pending, price: NaN }, now), /deposit/);
assert.throws(() => api.saveBooking(data, { ...pending, clientId: 'missing' }, now), /client/);

// Cancelling frees the slot. Restoring a cancelled booking checks it again.
const cancelled = api.saveBooking(data, { ...maya, status: 'cancelled' }, now);
const replacement = api.saveBooking(cancelled, { ...pending, status: 'confirmed' }, now);
assert.throws(() => api.saveBooking(replacement, maya, now), /overlaps/);
assert.throws(() => api.saveBooking(data, { ...maya, status: 'completed' }, now), /ended/);
assert.equal(api.saveBooking(data, { ...maya, status: 'completed' }, new Date(2026, 9, 11)).bookings[0].status, 'completed');
assert.throws(() => api.saveBooking(data, { ...pending, status: 'completed' }, now), /confirmed/);

const block = { id: 'break', date: maya.date, start: '12:00', end: '13:00', label: 'Lunch' };
const blocked = api.addTimeOff(data, block);
assert.throws(() => api.saveBooking(blocked, { ...pending, status: 'confirmed', time: '12:30', duration: 30 }, now), /blocked/);
assert.throws(() => api.addTimeOff(data, { ...block, start: '11:00' }), /already confirmed/);
assert.throws(() => api.saveAvailability(data, { ...data.availability, start: '18:00', end: '10:00' }), /Closing time/);
assert.throws(() => api.saveAvailability(data, { ...data.availability, days: [] }), /open day/);
const changedHours = api.saveAvailability(data, { ...data.availability, start: '11:00' });
assert.deepEqual(changedHours.bookings, data.bookings, 'Changing hours must never silently move existing bookings');

// Contacts, private notes and conversations retain separate records.
const client = { id: 'new-client', name: '  Demo Guest ', email: ' DEMO@example.invalid ', phone: '', notes: 'Keep this private.' };
const withClient = api.saveClient(data, client);
assert.equal(withClient.clients.at(-1).name, 'Demo Guest');
assert.equal(withClient.clients.at(-1).email, 'demo@example.invalid');
assert.throws(() => api.saveClient(withClient, { ...client, id: 'duplicate' }), /already exists/);
const message = api.addMessage(withClient, client.id, '  Hello!  ', 'client');
assert.equal(message.messages.at(-1).text, 'Hello!');
assert.equal(message.messages.at(-1).read, false);
assert.ok(!JSON.stringify(message.messages).includes('Keep this private.'));
assert.throws(() => api.addMessage(data, 'missing', 'Hello'), /client/);
assert.throws(() => api.addMessage(data, maya.clientId, '   '), /Write a message/);

// The account-scoped local store survives reload; failures never replace data.
const oldStorage = globalThis.localStorage, raw = new Map(); let fail = false;
globalThis.localStorage = { getItem: key => raw.get(key) ?? null, setItem: (key, value) => { if (fail) throw Error('Storage full'); raw.set(key, value); } };
try {
  assert.notEqual(api.artistStorageKey('artist-a'), api.artistStorageKey('artist-b'));
  const saved = api.persistArtistData('artist-a', withClient, 0);
  assert.equal(saved.revision, 1);
  assert.deepEqual(api.loadArtistData('artist-a'), saved);
  assert.ok(!api.loadArtistData('artist-b').clients.some(c => c.id === client.id));
  assert.throws(() => api.persistArtistData('artist-a', data, 0), /another tab/);
  assert.deepEqual(api.loadArtistData('artist-a'), saved);
  fail = true;
  assert.throws(() => api.persistArtistData('artist-a', message, 1), /Storage full/);
  assert.deepEqual(api.loadArtistData('artist-a'), saved);
  fail = false; raw.set(api.artistStorageKey('artist-a'), '{broken');
  assert.throws(() => api.loadArtistData('artist-a'));
  assert.throws(() => api.persistArtistData('artist-a', data, 0));
  assert.equal(raw.get(api.artistStorageKey('artist-a')), '{broken');
  assert.throws(() => api.parseArtistData(JSON.stringify({ ...data, clients: [{}] })), /could not be read/);
} finally { if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage; }
console.log('Artist workspace passed: request/approval, overlaps, turnaround, hours, blocked time, cancel/rebook, completion, contacts, conversations, account isolation, reload, stale writes and storage failures.');
