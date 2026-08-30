/*
 * tools/phrases.js — every line the games ever say, and the key it is filed under.
 *
 * The lists are pulled out of the game files themselves rather than copied, so
 * the recorded audio can never drift away from what the code actually asks for.
 * Run through tools/build-voice.py to turn this into voice/*.m4a.
 */
'use strict';

// The game files are browser IIFEs; give them just enough of a window to load.
global.window = global;
global.document = { getElementById: () => null, querySelector: () => null };
global.RoarAudio = { muted: true, sfx() {}, };
require('../spell-words.js');
require('../game-count.js');
require('../game-spell.js');
require('../game-clock.js');

/* Letters are recorded as the bare capital, which the phonemiser reads as the
   letter's name. Spelling them out phonetically was worse, not better: "ay"
   for A comes out as ˈaɪ — the very same phonemes as "eye" and as the letter
   I — so the game said "I" every time it meant "A". "eff" for F came out as
   "ee-eff-eff". All 26 bare letters phonemise correctly and distinctly;
   tools/check-letters.py is the proof, and will say so again if a voice
   changes. */

var PRAISE = ['Well done!', 'Brilliant!', 'You got it!', 'Superstar!',
              'Amazing!', 'Perfect!', 'Clever girl!'];

var out = {};
function add(key, text) {
  if (out[key] && out[key] !== text) throw new Error('key clash: ' + key);
  out[key] = text;
}

/* ── spelling bee ─────────────────────────────────────────────── */
SpellGame.WORDS.flat().forEach(function (w) {
  add('w-' + w[0].toLowerCase(), w[0]);
  add('c-' + w[0].toLowerCase(), w[2]);
});
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (L) {
  add('l-' + L.toLowerCase(), L);
});
PRAISE.forEach(function (p, i) { add('p-' + i, p); });

/* ── numbers, shared by counting, the clock and the calculator ── */
for (var n = 0; n <= 100; n++) add('n-' + n, CountGame.words(n));

/* ── the clock ────────────────────────────────────────────────── */
for (var h = 1; h <= 12; h++) {
  for (var m = 0; m < 60; m += 5) {
    // Both wordings: "half past seven" and "seven thirty". The game says
    // whichever she has it set to.
    add('t-' + h + '-' + m, ClockGame.spoken(h, m));
    add('d-' + h + '-' + m, ClockGame.spokenDigital(h, m));
  }
  add('th-' + h, 'It is pointing near ' + h + '.');
}
for (var mm = 0; mm < 60; mm += 5) {
  add('tm-' + mm, mm === 0 ? 'It is straight up.' : 'It is on ' + mm + '.');
}

/* ── everything else, said in more than one place ─────────────── */
var MISC = {
  'm-whattime':  'What time is it?',
  'm-yes':       "Yes! It's",
  'm-teachhour': 'The short gold hand is the hour.',
  'm-teachmin':  'The long blue hand is the minutes.',
  'm-soitis':    'So the time is',
  'm-plus':      'plus',
  'm-minus':     'minus',
  'm-takeaway':  'take away',
  'm-times':     'times',
  'm-sharedby':  'shared by',
  'm-equals':    'equals',
  'm-point':     'point',
  'm-clear':     'clear',
  'm-nozero':    "You can't share by zero.",
  'm-hundred':   'hundred',
  'm-thousand':  'thousand',
  'm-million':   'million',
  'm-and':       'and',
  'm-pickagame': 'Pick a game!',
  'm-missing':   'What letters are missing?',
  'm-dragsky':   'Drag the sky to look around.'
};
Object.keys(MISC).forEach(function (k) { add(k, MISC[k]); });

module.exports = out;

if (require.main === module) {
  process.stdout.write(JSON.stringify(out, null, 0));
}
