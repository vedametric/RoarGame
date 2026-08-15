# 🦁 Roar Battle

Two-player voice games for kids, built for an iPhone. No app store, no install,
no accounts — it's a static web page you open in Safari.

Each player picks a face — **either a photo** (camera or library) **or one of
ten animals**: rabbit, cow, lion, giraffe, seal, penguin, shark, tiger,
elephant or dino. Picking an animal also fills in the name, so a kid who can't
type yet still ends up with one. That face rides on the end of their claw-arm
during the game.

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

## 🎈 THE HOT AIR BALLOON — *a game by Sienna 🦄*

Reachable from **ALL GAMES** on the first screen. You are standing in the
basket at sunset, the striped envelope above your head and the ropes running
past your shoulders. Six buttons fly it: a move pad for **left / right /
forward / back**, and a **🔥 burner / ⬇︎ vent** pair for altitude — and you fly
in whatever direction you are facing.

**Drag the sky to look around**, all the way through 360°. A short press is a
grab rather than a look, so the two never fight. Firing the burner also twists
you slowly round, the way a real balloon does, and there is always a little
drift even when you are holding still.

**It sounds like flying.** Rushing air that rises and falls with your speed, a
roaring burner while you climb, a hiss while you vent, a sparkle for a unicorn,
a munch for food, a soft puff for a cloud, a sad little call if you bump a bird,
and a thump when you touch down. All synthesised — there are no sound files.

Out over the mountains there is plenty to collect — fly into something, or just
tap it:

| | | |
|---|---|---|
| 🍎 | food | +10 |
| ☁️ | clouds | +5 |
| 🦄 | unicorns | +25 — they drift, so you have to chase them |
| 🐦 | **birds** | **−10. Never collect a bird.** Bump one and it flaps away startled. |
| 🌱 | landing | +50 the first time you set her down gently |

There is no timer. Fly wherever you like, land whenever you like, and finish
with ✕ when you have had enough.

Everything you see is painted in code — the sunset gradient, the parallax
mountain ridges with sunset catching their tops, the receding fields with
animals grazing, the clouds with their shadowed undersides, the balloon and the
wicker basket. There are no image assets. The world uses a plain perspective
projection: every object has a world `(x, y, z)` and its screen position is
that divided by depth.

## One player or two

Choose at the start. **Two players** share the phone head to head; a
*take your sides* screen names who owns which end before anything begins, so
nobody has to guess. **One player** plays solo against their own best score.

There is a 🔊 button in the corner to play with the sound off.

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
audio.js        microphone, voice fingerprinting, speaker attribution
fx.js           particle bursts + confetti
game-grab.js    GRAB IT! — canvas game loop
game-roar.js    ROAR METER — bar-graph game loop
game-balloon.js THE HOT AIR BALLOON — by Sienna 🦄
app.js          screen flow, photos, results
```

Canvas text needs an explicit `"Apple Color Emoji"` family on iOS — the generic
`system-ui` will not fall back to it, which is why the animal avatars baked out
blank at first. There is a runtime probe that falls back to a large initial if
emoji cannot be drawn into a canvas at all.

---

**THE HOT AIR BALLOON is a game by Sienna 🦄.**

Built by Kunal, Sienna, and Claude.
