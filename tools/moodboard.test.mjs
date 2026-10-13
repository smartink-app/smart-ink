import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ stdin: { contents: "export * from './src/moodboard/model'; export * from './src/moodboard/storage'; export * from './src/moodboard/request'; export * from './src/moodboard/brief'; export * from './src/artist/model'; export * from './src/artist/storage';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const now = new Date(2026, 9, 9, 9), data = api.demoData(now);
let board = api.newBoard('Botanical forearm');
board = { ...board, brief: 'Delicate, with plenty of skin visible.', placement: 'Outer forearm', size: '12–15 cm' };
const image = { id: 'image1', kind: 'image', title: 'Leaves', note: 'I like the line weight.', image: '/tattoos/botanical-rose.png', url: '' };
board = api.addInspiration(board, image);
board = api.addInspiration(board, { id: 'link1', kind: 'link', title: 'Reference', note: 'The composition', image: '', url: ' https://example.com/inspiration ' });
board = api.addInspiration(board, { id: 'note1', kind: 'note', title: 'Meaning', note: 'A reminder to keep growing.', image: '', url: '' });
assert.equal(board.items[1].url, 'https://example.com/inspiration');
for (const unsafe of ['javascript:alert(1)', 'data:text/html,bad', 'file:///tmp/private', 'https://user:pass@example.com']) assert.throws(() => api.safeReferenceUrl(unsafe));
assert.throws(() => api.addInspiration(board, { ...image, image: 'https://remote.example/tracking.jpg' }));
assert.throws(() => api.addInspiration(board, { ...image, image: '/renders/../secrets.png' }));
assert.throws(() => api.addInspiration(board, { ...image, kind: 'note', image: '', note: ' ' }));
assert.throws(() => api.updateBoard({ version: 1, revision: 0, boards: [board] }, { ...board, items: [...board.items, image] }), /Check/);

// Immutable request attachments: removal and later edits cannot alter a brief already handed to the artist.
const removed = { ...board, items: board.items.map(i => i.id === 'link1' ? { ...i, removed: true } : i) };
const request = { id: 'board-request', artistId: 'nora', name: 'Example Client', email: 'example@example.invalid', date: '2026-10-12', time: '10:00' };
const requested = api.requestWithMoodboard(data, removed, request, now);
const booking = requested.bookings.at(-1);
assert.equal(booking.status, 'requested');
assert.equal(booking.service, 'Consultation');
assert.equal(booking.moodboard.items.length, 2);
assert.equal(booking.moodboard.artistName, 'Nora Vale');
assert.equal(booking.price, 0);
assert.match(booking.brief, /Outer forearm/);
removed.items[0].note = 'Changed afterwards';
assert.equal(booking.moodboard.items[0].note, 'I like the line weight.');
assert.notEqual(booking.moodboard, removed);
assert.equal(data.bookings.some(b => b.id === request.id), false);
assert.equal(api.requestWithMoodboard(requested, removed, request, now).bookings.length, requested.bookings.length, 'Same request ID is idempotent');
assert.throws(() => api.requestWithMoodboard(data, board, { ...request, artistId: 'olive' }, now), /open for requests/);
assert.throws(() => api.requestWithMoodboard(data, api.newBoard(), request, now), /at least one/);
assert.throws(() => api.requestWithMoodboard(data, board, { ...request, email: 'bad' }, now), /email/);
assert.throws(() => api.requestWithMoodboard(data, board, { ...request, date: '2026-10-01' }, now), /future/);
const client = data.clients[0];
const repeat = api.requestWithMoodboard(data, board, { ...request, name: 'Name supplied by client', email: client.email }, now);
assert.equal(repeat.clients.length, data.clients.length);
assert.deepEqual(repeat.clients[0], client, 'Client requests cannot overwrite private artist notes or existing contacts');
assert.ok(api.validMoodboardSnapshot(booking.moodboard));
assert.throws(() => api.parseArtistData(JSON.stringify({ ...requested, bookings: [{ ...booking, moodboard: { title: 'broken' } }] })), /could not be read/);

// Approval still uses the existing artist calendar rules.
const approved = api.saveBooking(requested, { ...booking, status: 'confirmed' }, now);
assert.equal(approved.bookings.at(-1).status, 'confirmed');
assert.deepEqual(approved.bookings.at(-1).moodboard, booking.moodboard);
assert.throws(() => api.saveBooking(approved, { ...booking, id: 'conflict', status: 'confirmed' }, now), /overlaps/);

// Local collection isolation, reload, stale writes, corrupt data and failed writes preserve existing references.
const raw = new Map(); let fail = false;
globalThis.localStorage = { getItem: key => raw.get(key) ?? null, setItem: (key, value) => { if (fail) throw Error('Quota'); raw.set(key, value); } };
assert.notEqual(api.moodboardKey('a'), api.moodboardKey('b'));
const start = api.loadMoodboards('a');
const saved = api.persistMoodboards('a', api.updateBoard(start, board), 0);
assert.deepEqual(api.loadMoodboards('a'), saved);
assert.equal(api.loadMoodboards('b').boards.length, 1);
assert.throws(() => api.persistMoodboards('a', start, 0), /another tab/);
fail = true; assert.throws(() => api.persistMoodboards('a', saved, 1), /could not save/); assert.deepEqual(api.loadMoodboards('a'), saved); fail = false;
raw.set(api.moodboardKey('a'), 'broken'); assert.throws(() => api.persistMoodboards('a', start, 1)); assert.equal(raw.get(api.moodboardKey('a')), 'broken');
delete globalThis.localStorage;

// Export is a portable static attachment, with escaped text and no executable user content.
const evil = { ...board, title: '<script>alert(1)</script>', brief: '<img src=x onerror=alert(1)>', items: [{ ...image, title: '\" onload=\"alert(1)', note: '<script>x</script>', image: 'data:image/jpeg;base64,YQ==' }] };
const html = api.briefHtml(evil);
assert.doesNotMatch(html, /<script|<img src=x|alt="" onload=/);
assert.match(html, /&lt;script&gt;/); assert.match(html, /data:image\/jpeg;base64,YQ==/);
assert.doesNotMatch(api.briefHtml(removed), /https:\/\/example.com\/inspiration/);
console.log('Moodboards passed: references, URL/image validation, frozen attachments, duplicate submission, contact preservation, request approval/conflicts, persistence, failure safety and escaped portable briefs.');
