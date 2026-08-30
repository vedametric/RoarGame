# 🦁 Roar Battle

Two-player voice games for kids, built for an iPhone. No app store, no install,
no accounts — it's a static web page you open in Safari.

Each player picks a face — **either a photo** (camera or library) **or one of
ten animals**: rabbit, cow, lion, giraffe, seal, penguin, shark, tiger,
elephant or dino. Picking an animal also fills in the name, so a kid who can't
type yet still ends up with one. That face rides on the end of their claw-arm
during the game.

The animals are **drawn, not emoji** — ten little vector faces painted with
canvas paths in `animals.js`. Emoji were tried first and were never reliable:
iOS will not fall back to the colour emoji font inside a canvas unless you name
it exactly, the font may not be ready when the avatar is baked, and the same
glyph looks different on every device. Drawing them removes all of that, so the
face a kid picks is the face they get, every time, on every phone.

Then each player records their own sound ("make your sound!" — a roar, a meow,
a moo, anything). If the raw capture comes back unusable on some device, the
game synthesises a growl around that player's own pitch instead, so a tap
always makes a noise. That recording is used two ways:

- **👆 TAP mode (default)** — tap your own half of the screen and your recorded
  sound plays once per tap: *roar, roar, roar*. Nobody has to shout, so nobody
  ends up hoarse. This mode ignores the microphone entirely during play.
- **🎤 SHOUT mode** — actually shout, and the game splits the microphone between
  the two saved voice fingerprints.

**You choose which one right after BEGIN GAME**, before anything else, and can
switch on the mode screen later. Only one is ever active — they never run at
the same time.

That exclusivity is not just tidiness. While a `getUserMedia` capture is live,
iOS puts the audio session into play-and-record and routes output to the
**earpiece** at a fraction of the volume, which makes the tapped-back voices
almost inaudible. So TAP hands the microphone back as soon as both sounds are
recorded, and SHOUT takes it again if you switch. As a bonus the iOS recording
indicator goes away when the game isn't listening.

---

## The first screen

**Every game is on it**, as a grid of tiles — nothing is hidden a tap inside.
The same tiles, in the same order, appear again under **see all games**: the
list lives in one place in `app.js` and is rendered twice, so the two can never
drift apart as games keep being added.

They are ordered the way a child reaches for them: the noisy ones first
(GRAB IT!, ROAR METER, THE HOT AIR BALLOON), then the learning ones (SPELLING
BEE, WHAT'S THE TIME?, COUNTING, CALCULATOR), warm and cool borders to match.

**set up 2 players** is not another door onto the same room: the GRAB IT and
ROAR METER tiles drop you straight into that game, while this takes the two of
you through faces and voices and leaves you on the mode screen — which is where
the TAP/SHOUT switch and the *"your voices sound too alike"* warning live.

---

## 🕐 WHAT'S THE TIME? — *learning to read a clock*

Both kinds of clock, taught together. Every question shows one and asks for the
other, so the round one and the numbers one stop being separate things in her
head:

- **read the hands** — a big clock face, and four answers written both ways:
  `7:40` above *20 minutes to eight*;
- **pick the clock** — a digital time and the words, and four little clock
  faces to choose between.

**It teaches before it tests.** The hour hand is short and gold, the minute hand
long and blue, labelled that way under the clock itself. **💡 TEACH ME** says
out loud which hand to look at and what each one is pointing at — *"the short
gold hand is the hour, it is pointing near 7; the long blue hand is the minutes,
it is on 40, so it is 20 minutes to eight."* **🔊 SAY IT** reads the time, and
**🔢 minutes** turns the 05, 10, 15… ring outside the face on and off — the
scaffold that makes "25 past" readable, there for as long as she needs it.

**Getting it wrong costs nothing.** A wrong answer wobbles and stays put; a
second one *takes a wrong answer off the board* and explains the clock, so she
is always closing in rather than stuck. A right one brings confetti, one to
three stars, and the time said out loud.

**Four stages, four right answers each:** o'clock → half past → quarter past and
to → every five minutes.

Two details that matter for learning. The hour hand **creeps between the
numbers** as the hour goes on, exactly as a real one does, because reading that
is half the skill. And a time is never asked when **the two hands would lie on
top of each other** — 7:40 puts them ten degrees apart, which nobody can read,
let alone somebody learning; every question keeps them at least 20° apart.

---

## 🎈 THE HOT AIR BALLOON — *a game by Sienna 🦄*

Reachable from **ALL GAMES** on the first screen. You are standing in the
basket at sunset, the striped envelope above your head and the ropes running
past your shoulders. Six buttons fly it: a move pad for **left / right /
forward / back**, and a **🔥 burner / ⬇︎ vent** pair for altitude — and you fly
in whatever direction you are facing.

**Fly all the way up to space.** The ceiling is 3,200m — seven times what it
was. Keep the burner on and the sunset drains away to black, stars come out,
the moon appears, and the ground curves away below you into a blue planet with
its atmosphere glowing along the rim. The air thins as you climb so the balloon
fairly shoots up the last stretch; reaching space is worth **+100**. There is a
mark on the altitude gauge showing how far there is to go.

**👽 Aliens.** Little flying saucers with a green pilot under the dome, running
lights blinking round the rim and a beam of light underneath. They dart about
rather than drift, they only appear high up — never down at treetop height —
and they are worth **+40**, more than a unicorn. Above the clouds they are most
of what is out there, though the odd unicorn still drifts past among the stars.

**🌦️ The weather changes on its own**, every twenty to forty seconds, and it is
announced when it turns. **Clear skies**, **wind** that visibly shoves the
balloon across the sky, **rain**, **snow** that sways as it falls, a
**thunderstorm** with lightning and thunder a beat behind it, **fog** that
closes in, and a **rainbow** — which only ever follows the rain, the way it
does out of the window. Every kind pushes the balloon as well as decorating the
sky, so you feel it and not just see it. And since real weather happens down in
the air, **climbing is a way to escape a storm**.

**Drag the sky to look around**, all the way through 360°. A short press is a
grab rather than a look, so the two never fight. Firing the burner also twists
you slowly round, the way a real balloon does, and there is always a little
drift even when you are holding still.

**It sounds like flying.** Rushing air that rises and falls with your speed, a
roaring burner while you climb, a hiss while you vent, a sparkle for a unicorn,
a munch for food, a soft puff for a cloud, a sad little call if you bump a bird,
a theremin swoop for a flying saucer, the hiss of rain, rolling thunder, and a
thump when you touch down. All synthesised — there are no sound files. **Space
is silent**: there is no air up there to rush past you, so the wind fades out
as you leave the atmosphere.

Out over the mountains there is plenty to collect — fly into something, or just
tap it:

| | | |
|---|---|---|
| 🍎 | food | +10 |
| ☁️ | clouds | +5 |
| 🦄 | unicorns | +25 — they drift, so you have to chase them |
| 🐦 | **birds** | **−10. Never collect a bird.** See below. |
| 👽 | aliens | +40 — only up where the air runs out |
| 🚀 | space | +100 the first time you get all the way up |
| 🌱 | landing | +50 the first time you set her down gently |

There is no timer. Fly wherever you like, land whenever you like, and finish
with ✕ when you have had enough.

**About the birds.** They are not points, they are a mistake, and the game makes
that unmistakable. Touch one and it startles sideways in a hopping little skip,
then bursts in a puff of feathers with **−10** floating up, and the body
tumbles end over end all the way down to the ground, where it lands in one last
scatter of feathers and a new thing drifts in to take its place. It all plays
out in world space, so you can watch the whole fall from wherever you happen to
be flying.

Everything you see is painted in code — the sunset gradient, the parallax
mountain ridges with sunset catching their tops, the receding fields with
animals grazing, the clouds with their shadowed undersides, the balloon and the
wicker basket. There are no image assets. The world uses a plain perspective
projection: every object has a world `(x, y, z)` and its screen position is
that divided by depth.

## 🔢 COUNTING

Also in **ALL GAMES**. A deep, slow man's voice counts out loud from zero and
keeps going — one, two, three — with a **three and a half second pause** after
each number. There is no score and no end.

The numeral fills the screen, the word sits under it, and up to twenty there
are dots to count along with. A ring around the number fills up during the
pause so you can see the next one coming.

The voice comes from whatever the phone has. Depth comes from **choosing a
naturally deep reader** (Alex, Daniel, Aaron, Arthur, …), not from pitch-shifting
— dropping a synthesiser's pitch a long way wrecks its formants and turns it
into a growling robot. Rate `0.85` and pitch `0.92` are gentle nudges that stay
human. Downloaded **Enhanced** and **Premium** voices are preferred strongly,
because they sound far more like a real person than the compact defaults, and
the novelty voices (Zarvox, Trinoids, Albert…) are filtered out entirely.

**change voice** opens a picker of the male voices on that phone; tap one to
hear it count to three. It also points at
*Settings → Accessibility → Spoken Content → Voices*, where the much better
Enhanced voices can be downloaded.

Timing follows the utterance's own `onend` rather than a fixed timer, so the
pause is always a real pause *after* the word however long it takes to say
"one hundred and thirty-seven" — with a watchdog, because iOS does not reliably
deliver `onend`.

## 🧮 SIENNA'S CALCULATOR

Also in **ALL GAMES**. A plain, friendly calculator with big buttons: **add,
take away, times and share**, plus a decimal point, backspace and clear.

The line above the answer shows the sum being built — `12 + 5` — so a child can
see what they are doing rather than watching digits appear from nowhere. It
works on the pending pair the way a pocket calculator does, so `2 + 3 + 4` shows
**5** the moment the second `+` is pressed, which is exactly the running total a
kid expects.

**🔊 reads it out loud** — every key as it is pressed ("seven", "plus", "two")
and the answer a little slower ("equals nine"). Tap the speaker to turn the
voice off and it becomes a silent calculator; the main sound button silences it
too.

**Big numbers are read back whole.** Typing 54321 one key at a time only ever
said "five, four, three, two, one", which tells a child nothing about the number
they have just made. So when the typing stops, it says the whole thing —
*"fifty-four thousand three hundred and twenty-one"* — with no need to press
equals; the pause itself is the cue. Pressing another key first cancels it, a
single digit is not repeated back because it is already whole, and the words
come from the same number-speller COUNTING uses, so both games say a number the
same way.

Sharing by zero doesn't error or show `Infinity`; it says **oops!** and
"you can't share by zero", and clears itself ready for another go.

## 🐝 SPELLING BEE — *a spelling game for Sienna 🦄*

Also in **ALL GAMES**. Hangman's shape without hangman's punishment.

A word appears with **most of it already filled in** — always the first letter,
and never fewer than **60% of the letters** — and the job is working out the few
that are missing. Kangaroo comes up as `K _ n _ a r _ o`; Cat as `C a _`. Two
blanks never sit next to each other while there is any other choice, because a
gap in the middle of a word is far easier to read than a hole. However long the
word, it stays on **one line** — the tiles shrink to fit rather than wrapping,
because a word split over two rows stops looking like a word.

Words are written the way they are written down: **a capital to start and small
letters after** — Cat, Butterfly, Christmas — never CAT.

**Nothing is ever lost.** There is no man to hang, no lives to run out, no way
to fail a word. A wrong letter wobbles the key and gives a soft low blip that
says *not that one* — and that is all. Everything that goes *right*, though, is
celebrated loudly:

- every correct letter pops into a gold tile with a note **a step higher than
  the last**, so filling a word in is a little rising tune rather than the same
  ping over and over;
- finishing sets off **confetti**, a five-note fanfare with a sparkle over the
  top, **one to three stars**, and a spoken *"Brilliant! — butterfly"*;
- stars pile up in the corner and a **🔥 streak** counts every word in a row.

**Three ways to get help**, and using them is never punished beyond a star:

| | |
|---|---|
| 🔊 **HEAR IT** | says the word out loud |
| 🔤 **SPELL IT** | reads out every letter, one at a time with a beat between — *"C… A… T"* — then says the whole word again |
| 💡 **HINT** | first tap explains the word (*"it hops and keeps its baby in a pocket"*); after that it fills the next letter in for her |

The word is spoken the moment it appears, there is a **picture above every
word**, and after three wrong tries the clue turns up by itself — she is never
left stuck long enough to stop enjoying it.

**Two keyboards, and both cases.** Two small buttons above the letters:

- **⌨️ qwerty / abc** — QWERTY laid out like a real keyboard (10 / 9 / 7), or
  the alphabet straight through (7 / 7 / 7 / 5). A–Z is the one a five year old
  can actually find a letter on; QWERTY is the one she will type on for the rest
  of her life, and the habit is worth starting early. **QWERTY is the default**;
  one tap swaps it.
- **a → A** — whether the keys show capitals or small letters, so she learns
  both letterforms. It only changes what is printed on the keys: the word above
  is always written properly, and a lower-case key answers a capital in the word
  perfectly happily. Case never matters to the answer.

Both choices are **remembered between visits**, so whatever you set up for her
is still there next time.

**It grows with her.** Words are banded by length, from three letters up to
**CHRISTMAS**, and every three words moves up a band. Nothing repeats until the
whole band has been round. Single letters are read a little higher and slower,
because a letter at normal pitch can sound like a different one.

## One player or two

Choose at the start. **Two players** share the phone head to head; a
*take your sides* screen names who owns which end before anything begins, so
nobody has to guess. **One player** plays solo against their own best score.

There is a 🔊 button in the corner to play with the sound off.

## Leaving a game

**Every game has a ✕.** GRAB IT and ROAR METER used not to, so the only way out
of a round was to wait out the clock or close the whole app — which is a silly
thing to make anyone do.

**It asks before it closes**, because a ✕ is easy to hit by accident with a
phone flat on the table between two children. While the question is up the game
is *held*, not stopped: the clock does not run down behind it, the balloon hangs
still, the counting waits, and taps do not reach the game. **KEEP PLAYING** puts
you back exactly where you were with the round intact, and so does tapping the
dark surround — the safe answer is where a stray finger lands. A pause you set
yourself with ⏸ survives the question too.

Both buttons are labelled for what they actually do — *KEEP FLYING / FINISH* in
the balloon, *KEEP COUNTING / STOP* in COUNTING — and only a genuinely
destructive **LEAVE** is tinted red. Finishing a flight ends with your score on
screen, so it is not a warning. Leaving GRAB IT or ROAR METER drops you back on
the mode screen with the players still set up, so another go is one tap away.

## The tap games

### 🖐️ GRAB IT! — 45 seconds, 4 levels

Put the phone flat on the table between the two players, sitting opposite each
other. The top half of the screen is rotated 180° so each kid reads their own
side the right way up.

Something pops up on the centre line, **exactly the same distance from each
player**. Every tap walks your claw-arm one step closer. **Holding a finger
down does nothing** — only separate taps count, so there is no way to lean on
the screen and cheat. In SHOUT mode each separate burst of noise is one step,
so "roar, roar, roar" does the same job.

Not everything is worth tapping:

| | | |
|---|---|---|
| ⭐ | **treat** | a few steps, first claw there takes it |
| 🌟 | **golden** | double points, but it does not hang around |
| 💣 | **bomb** | do not touch it — 15 points off and your arm **freezes solid** |
| **7** | **number** | needs **exactly** that many taps. One too many and you bust. |

The numbered objects are the reason mashing does not pay. Arriving starts a
short settle, and an extra tap during it overshoots: tap a **10** ten times and
it is yours, tap it eleven times and you get nothing. Bigger numbers pay more.

- Grabs in a row build a **combo multiplier**, up to ×3.
- Taps between objects still play your sound, but count for nothing — you
  cannot charge up before something appears.
- Miss a treat before its ring runs out and it escapes. Letting a *bomb* expire
  is the correct play, so it just fizzles.
- **It gets harder:** every level the stars appear faster, vanish sooner, get
  smaller, and the arms get heavier.

  | Level | New star every | Star lasts | Star size |
  |-------|---------------|-----------|-----------|
  | 1     | 1.25s         | 2.50s     | large     |
  | 2     | 0.95s         | 2.00s     | –         |
  | 3     | 0.72s         | 1.60s     | –         |
  | 4     | 0.52s         | 1.25s     | small     |

  A drain bar on the left edge shows the time left and pips on the right edge
  show the level — both readable from either side of the phone.

You can't park your claw on the middle and camp: with nothing out, the arm tops
out short of the centre. You have to go in bursts, which is a lot more fun (and
easier on small voices) than one long press or one long scream.

### 📊 ROAR METER — 20 seconds

Hold the phone up between the two players. Tap your own side of the screen as
fast as you can — or roar, in SHOUT mode — and your bar climbs. The bars
rescale as the leader grows, so there's always somewhere higher to go.

---

## How the two voices are told apart

Both players share one phone and one microphone, so the voices can't be
physically separated. Instead, during the "make your sound!" step we build a
small **fingerprint** of each player:

| Feature    | What it captures |
|------------|------------------|
| `pitch`    | fundamental frequency, from normalised autocorrelation |
| `centroid` | spectral centre of mass — how bright the sound is |
| `rolloff`  | frequency below which 85% of the energy sits |
| `bands`    | a 20-band log-spaced energy template of the whole sound |

This only applies in SHOUT mode. During play, each analysis frame is **split**
between the two players rather than handed to whoever is loudest. The band template does the heavy lifting:
when both kids shout at once the microphone hears the sum of two spectra, so
we solve for how much of each template is present (a two-column non-negative
least squares). The pitch/brightness distance is folded in as a tie-breaker
for the moments only one of them is making noise.

A frame is thrown away entirely — nobody scores — unless it passes all three
checks: it is not broadband noise (spectral flatness below 0.62), it actually
resembles one of the saved voices (cosine similarity above 0.74), and its
feature distance to the nearer profile is under 1.15. The two-template solve is
also ridge-regularised; without that, two similar voice prints make the system
ill-conditioned and the solution can flip, handing one player's voice to the
other. The noise floor keeps adapting to the room while the game runs.

**This works best when the two sounds are genuinely different** — one high
squeaky MEOW and one deep growly ROAR separate far better than two kids doing
the same roar. The game measures how alike the two fingerprints are and shows
a warning on the mode-picker screen if they're too close, with a button to
re-record.

The microphone is opened with `echoCancellation`, `noiseSuppression` and
`autoGainControl` all switched **off** — those filters would flatten exactly
the loudness and timbre differences the game is measuring.

---

## Privacy

Everything stays on the phone. Photos are cropped and resized in the browser
and never uploaded. The recorded sound lives only in memory as a Web Audio
buffer for the length of the session — it is never written to disk, never
uploaded, and is gone when the tab closes. There is no server, no analytics, no
network traffic at all after the page loads.

---

## Running it

It's a static site with **no build step**. Any static host works.

Locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

### GitHub Pages

`.github/workflows/pages.yml` deploys `main` automatically. One-time setup:

**Settings → Pages → Build and deployment → Source: GitHub Actions**

Then push to `main`. The site lands at
`https://<owner>.github.io/<repo>/`.

> ⚠️ The microphone only works over **HTTPS** (or `localhost`). GitHub Pages
> serves HTTPS, so opening the Pages URL on an iPhone works. Opening the page
> over plain `http://` from another machine on your network will not — Safari
> blocks `getUserMedia` on insecure origins.

---

## Playing on an iPhone

1. Open the HTTPS URL in Safari.
2. Tap **BEGIN GAME** and allow the microphone when asked. It is needed to
   record each player's sound, even if you then play in TAP mode.
3. Optionally **Share → Add to Home Screen** for a fullscreen, no-browser-chrome
   version.

If the mic prompt never appears, check **Settings → Safari → Microphone**.

Tested on iPhone-sized viewports down to the SE (375×667). The screen is kept
awake during play via the Screen Wake Lock API where available.

---

## Files

```
index.html      all screens
styles.css      everything visual
speech.js       plays the recorded voice, falls back to the browser's
voice/          497 recorded clips + manifest.json
tools/          phrases.js and build-voice.py, which make voice/
animals.js      the ten animal faces, drawn with canvas paths
audio.js        microphone, voice fingerprinting, speaker attribution
fx.js           particle bursts + confetti
game-grab.js    GRAB IT! — canvas game loop
game-roar.js    ROAR METER — bar-graph game loop
game-balloon.js THE HOT AIR BALLOON — by Sienna 🦄
game-count.js   COUNTING — spoken numbers, forever
game-calc.js    SIENNA'S CALCULATOR — arithmetic, read aloud
game-spell.js   SPELLING BEE — the words, and the game around them
game-clock.js   WHAT'S THE TIME? — clock drawing, and the questions
app.js          screen flow, photos, results
```

## The voice

**Nothing the games say is synthesised on the phone any more.** The browser's
own speech synthesiser sounds mechanical on any device that has only the
*compact* voices installed — which is most of them — and a child who is
frightened of the voice simply stops playing. So every fixed line is spoken
once, ahead of time, by a neural voice, and shipped as a small audio file.

**497 clips, 3.3 MB**, loaded one at a time as they are needed:

| | |
|---|---|
| `w-cat`, `c-cat` | the 87 spelling words, and their clues |
| `l-a` … `l-z` | the letters, said the way they sound — *ay, bee, see* — because a voice reads a bare "A" as an indefinite article |
| `p-0` … `p-6` | *Well done!*, *Brilliant!*, *Superstar!* |
| `n-0` … `n-100` | every number to a hundred |
| `t-7-30` | all 144 times on the clock — *half past seven* |
| `th-7`, `tm-40` | the halves of the clock explanation |
| `m-*` | plus, take away, equals, point, hundred, thousand, and… |

`tools/build-voice.py` generates the lot in about a minute with
[Piper](https://github.com/rhasspy/piper), a neural TTS that runs locally.
`tools/phrases.js` **loads the game files and asks them** what they say, rather
than keeping a copy of the word lists — so the audio can never drift from the
code. Reshooting in a different voice is one flag:

```bash
python3 tools/build-voice.py --voice en_GB-alba-medium
```

**Numbers past a hundred are read out of the parts**: 54,321 plays as
*fifty-four — thousand — three — hundred — and — twenty-one*, which is how you
would say a big number to a child anyway. The clock's explanation is stitched
the same way, but only at sentence boundaries, so every join lands where a
person would have drawn breath.

**The browser voice is still there as a fallback** — for a number past a
billion, a decimal answer, any line not yet recorded — and that fallback is
fixed too. It used to be broken in a way that was invisible: Safari fills the
voice list asynchronously, the first `getVoices()` returns nothing, and the old
code cached that empty answer *forever*. It never used the good voices even when
they were installed. It now waits for the list, and prefers a bright voice over
a sepulchral one.

> Worth doing anyway: **Settings → Accessibility → Spoken Content → Voices**
> downloads the Enhanced voices, which are far better than the compact ones the
> phone ships with. That only affects the fallback now, but it costs nothing.

## Cache busting

A phone that has played before will happily keep serving itself the old files,
which is worse than it sounds: new HTML running last week's JavaScript breaks in
ways that look like real bugs. So:

- The document asks not to be cached, because it is the file that names the
  version of everything else.
- Every script, the stylesheet and the manifest are fetched as `?v=<build>`.
  `.github/workflows/pages.yml` rewrites `?v=dev` to the short commit SHA it is
  deploying, so a new deploy requests URLs the phone has never seen and cannot
  have cached. In the repo the files stay `?v=dev`, so local development is
  unaffected.
- The splash shows which build is loaded — `build 1a2b3c4`. **Tap it** to
  reload past anything Safari is still holding on to. Handy when the page has
  been added to the Home Screen, where there is no address bar to pull down.

---

**THE HOT AIR BALLOON is a game by Sienna 🦄.**

Built by Kunal, Sienna, and Claude.
