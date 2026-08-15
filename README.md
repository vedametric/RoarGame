# 🦁 Roar Battle

Two-player voice games for kids, built for an iPhone. No app store, no install,
no accounts — it's a static web page you open in Safari.

Each player uploads a photo and records their own sound ("make your sound!" —
a roar, a meow, a moo, anything). The game learns each voice, then uses it to
tell the two players apart while they both shout at the same phone.

---

## The two games

### 🖐️ GRAB IT! — 45 seconds, 4 levels

Put the phone flat on the table between the two players, sitting opposite each
other. The top half of the screen is rotated 180° so each kid reads their own
side the right way up.

A star pops up on the centre line, **exactly the same distance from each
player**. Shout your sound and your claw-arm shoots out towards it; stop
shouting and it springs back. First claw to touch the star grabs it.

- Louder shouting = faster arm.
- Grab in a row for a **streak bonus**.
- Miss it before the ring runs out and it escapes — nobody scores.
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

You can't park your claw on the middle and camp: with no star out, the arm
tops out short of the centre. You have to shout in bursts, which is a lot more
fun (and easier on small voices) than one long scream.

### 📊 ROAR METER — 20 seconds

Hold the phone up between the two players. Everyone roars at once and each
player's bar climbs by their share of the noise. The bars rescale as the
leader grows, so there's always somewhere higher to go.

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

During play, each analysis frame is **split** between the two players rather
than handed to whoever is loudest. The band template does the heavy lifting:
when both kids shout at once the microphone hears the sum of two spectra, so
we solve for how much of each template is present (a two-column non-negative
least squares). The pitch/brightness distance is folded in as a tie-breaker
for the moments only one of them is making noise.

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
and never uploaded; the microphone audio is analysed frame-by-frame and never
recorded, stored, or sent anywhere. There is no server, no analytics, no
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
2. Tap **BEGIN GAME** and allow the microphone when asked.
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
app.js          screen flow, photos, results
```

---

Built by Kunal, Sienna, and Claude.
