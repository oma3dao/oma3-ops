# OMA3 Brand Guidelines

**Status:** v1 — first written record of the OMA3 brand.
**Last updated:** 2026-09-11

The OMA3 brand had never been written down. It existed in a Webflow project and
in one investor deck, and those two disagreed with each other. This document
reconciles them and becomes the source of truth.

It governs the website, decks, and collateral. It does **not** govern the
content of any individual piece — what a given page or deck *says* is written
separately. See [Voice and positioning](#8-voice-and-positioning) for the line
between the two.

---

## How to read this document

Every statement carries one of three labels.

| Label | Meaning |
|---|---|
| **Observed** | Measured from the live site or the deck. Factual, not a judgement. |
| **Decision** | OMA3 has chosen this. It overrides what is currently live. |
| **Recommendation** | Not currently defined anywhere. Proposed here, and open to rejection. |

Where the site and the deck disagreed, [§9](#9-contradictions-and-how-they-were-resolved)
records the conflict and which one won, so a future reader can see that a choice
was made rather than assuming the loser was an error.

---

## 1. Sources

**Observed.** Two artifacts were measured.

**The website** — `oma3.org` and its stylesheet
(`openmeta.webflow.shared.a92a75497.css`), read September 2026. The site is
mid-migration off Webflow into `oma3dao/oma3-landing`.

**A 2026 investor deck** — thirteen slides, built by a designer working from the
website, then edited by non-designers. That editing history matters: several
defects in the deck are drift introduced after handoff, not design intent, and
are recorded as such rather than as competing conventions.

**omatrust.org** — the OMATrust product site (`oma3dao/omatrust-landing`), read
September 2026. It was not part of the original documentation pass and does not
follow this document. It is built dark (`hsl(228 60% 6%)` ground, cyan
`hsl(186 100% 50%)` accent), sets **Inter and JetBrains Mono only**, and uses
**lucide** for icons. See [§9.7](#97-omatrustorg-is-a-second-design-language).

Nothing in this document is invented except where marked **Recommendation**.

---

## 2. Logo

### The wordmark

**Observed.** Two versions exist and they are not the same asset.

| Where | File | Size | Contents |
|---|---|---|---|
| Website | `OMA_logov2.png` | 158 × 34 | Wordmark only |
| Deck | embedded PNG | 1200 × 243 | Mark + wordmark lockup |

The deck's asset is the better one: it is 7.6× the resolution and it includes
the mark — a circle containing a triangle, rendered in the brand gradient —
which the website's asset omits entirely.

**Decision.** The full lockup (mark + wordmark) is the primary logo. The
wordmark alone is permitted where horizontal space is constrained.

**Recommendation.** Extract the lockup from the deck at full resolution and use
it everywhere until an SVG exists. No vector version of either asset currently
exists — see [§11](#11-assets-to-commission).

### Gradient direction in the logo

**Observed.** The wordmark's gradient runs violet on the left, through blue, to
turquoise on the right — matching the website's gradient definition and
contradicting the deck's. The logo is therefore evidence for the website's
gradient being correct. See [§9.1](#91-the-gradient-was-reversed).

### Clear space and minimum size

**Observed.** Not currently defined.

**Recommendation.** Clear space on all four sides equal to the height of the
mark. Minimum width 120px on screen, 32mm in print, for the full lockup; 90px /
24mm for the wordmark alone. Validate against the 158 × 34 raster before
adopting — below roughly 120px the current PNG will visibly soften.

### Backgrounds

**Decision.** The logo sits on white, on `--surface-alt` (#FAFAFA), or on dark
imagery. It does **not** sit on the brand gradient — gradient type on a gradient
ground destroys the mark. On busy imagery, use a solid-white or solid-dark
version rather than the gradient lockup.

**Recommendation.** Commission solid one-colour versions (white, and #333333)
for exactly this case. None currently exist.

---

## 3. Colour

### Palette

**Observed.** Webflow already names most of these as custom properties. Those
names are the closest thing OMA3 has to an existing vocabulary and are kept.

| Token | Hex | Role |
|---|---|---|
| `--blue-violet` | `#7900FF` | Gradient origin |
| `--dodger-blue` | `#327CFF` | Gradient midpoint; primary action |
| `--turquoise` | `#00F4D7` | Gradient terminus |
| `--grey` | `#78787A` | Secondary text |
| `--white-smoke` | `#EBEBEB` | Hairlines, cell outlines |
| `--white` | `#FFFFFF` | Primary ground |

**Observed.** Three values are in use on the site but were never tokenised.

| Proposed token | Hex | Role |
|---|---|---|
| `--ink` | `#333333` | Body text — set on `body`, not tokenised |
| `--surface-tint` | `#F5F5F5` | Pill background |
| `--surface-alt` | `#FAFAFA` | Alternate section ground |

**Recommendation.** Tokenise all three under those names during the
`oma3-landing` migration. An untokenised body colour is how you end up with
`#2B2B2B` in a deck.

### Not brand

**Observed.** `#3898EC` appears seven times in the stylesheet. It is Webflow's
default component blue, not an OMA3 colour. Exclude it, and do not carry it into
the migration.

**Decision.** The following appeared in the deck and are **not** brand colours.
They are drift and must not propagate: `#2B2B2B`, `#EFEFEF`, `#F3F3F3`,
`#9900FF`, `#00FFD0`, `#5573EB`, `#37A2E1`, `#4D80E8`, `#1FCCD9`, `#9E9E9E`.

Note what that list contains: four unaccounted blues, and near-misses for the
body colour, the hairline, and both gradient endpoints. Every one of them is a
value somebody eyeballed instead of looking up. That is the failure mode this
document exists to prevent.

### The gradient

**Decision.** The gradient is the brand signature — not any single colour. Any
treatment that reduces OMA3 to "blue" has lost the thing that identifies it.

```css
linear-gradient(45deg, #7900ff, #327cff 49%, #00f4d7)
```

Three properties are load-bearing and none may be changed independently:

- **45°**, running lower-left to upper-right
- **Three stops.** The `#327CFF` midpoint at 49% is what keeps the transition
  from going muddy. A two-stop violet-to-turquoise gradient is not this gradient.
- **Violet → blue → turquoise**, in that order. This is the order the logo uses.

### When to use the gradient versus flat colour

**Observed.** The site uses the gradient for `.heading--gradient` (gradient-filled
type) and `.container--gradient`.

**Decision.**

| Use the gradient for | Use flat colour for |
|---|---|
| The logo | Body copy — always `--ink` |
| One hero or section headline per page | Secondary text — `--grey` |
| A single emphasis surface per view | Buttons and links — `--dodger-blue` |
| Large ambient background shapes | Icons, rules, borders |

The constraint is **once per view**. The gradient reads as a signature when it
appears once and as decoration when it appears three times.

---

## 4. Typography

### Display face — changing

**Observed.** The site uses **Monument Extended** (Pangram Pangram), self-hosted
as `.otf`, with two cuts mapped Ultrabold → 700 and Regular → 400. Every heading
on the site uses weight 400 — Regular, not Ultrabold. Monument Extended Regular
is a display cut and reads considerably heavier than a typical 400; it must not
be described as "light".

The deck does not use Monument Extended. It uses **Krona One** (392 runs) —
a free Google Font the designer substituted.

**Decision.** OMA3 does not hold a licence covering webfont use of Monument
Extended. The display face becomes **Archivo Expanded** (Omnibus-Type, SIL Open
Font License), available through Google Fonts and self-hostable.

Archivo Expanded was chosen over Krona One, the deck's substitute, for one
reason: Krona One ships a single weight and no italic, which forces all hierarchy
through size and colour. Archivo Expanded is variable across both weight and
width, so it can carry hierarchy the way Monument Extended did.

**Recommendation.** Monument Extended Regular reads heavier than its nominal
weight. Do not map it to Archivo Expanded 400 by reflex — test 500 and 600
against the live site before fixing the mapping, and record the result here.

### Where the display face applies

**Decision.** Archivo Expanded is a **hero face**. It is used where the type *is*
the subject being looked at — covers, section openers, a single large statement
that occupies the composition on its own. It is **not** used on any surface whose
job is to describe something else.

Concretely: `h1` and `h2` only. **`h3` and below are Inter**, as is every label,
field name, caption, table cell, list item and diagram annotation.

The reason is not a size floor, it is a density one. An extended display face
carries a composition when it has room to be looked at. Drop it into a dense
surface — a table, a diagram, a card of fields — and it appears exactly once, in
the title, with Inter doing all the surrounding work. It then reads not as a
system but as two unrelated fonts, one of them stranded. The face has not gotten
worse; it is being asked to behave like a text face, which it is not.

This also explains the `h3` exception recorded below. `h3` was already the level
where the site stopped uppercasing, because `h3` is where proper nouns live. It
is the same boundary seen from the other side: `h3` is where type stops being the
subject and starts being the content. Both rules change at the same place, and
that is not a coincidence.

**Consequence for decks.** A detail-dense deck should be set in Inter throughout,
with the display face reserved for the cover and any section openers. A deck that
puts Archivo Expanded on every slide title is applying the brand where it does not
help. This is how the September 2026 OMATrust deck is built.

Body face is unchanged: **Inter**. Keeping Inter makes the swap one-for-one, and
the contrast between a wide display face and a neutral body face is doing real
work. Inter is also better than Archivo at small sizes.

### Web type scale

**Observed.** As authored. `rem` = 16px; the site sets no `html` font-size.

| Element | Size / line-height | Uppercase |
|---|---|---|
| `h1` | 7.5rem / 7.5rem | Yes |
| `h1` in hero (`.heading--intro`) | 4rem / 4rem, white | Yes |
| `h2` | 2.2rem / 2.4rem | Yes |
| `h3` | 24px / 30px | **No** |
| `h4` | 18px / 24px | Yes |
| `h5` | 14px / 20px | Yes |
| `.nav__link` | — | Yes, `letter-spacing: 1px` |

### The uppercase rule

**Decision.** Headings are uppercase. **`h3` is the exception and is always
mixed case.**

This is deliberate, not an oddity: `h3` is what renders people's names on the
leadership page, and names in all-caps read as shouting. Any heading level that
might carry a proper noun follows `h3`, not the rule.

**Decision.** Uppercase is applied in CSS (`text-transform`), never by typing in
caps. The deck typed it manually — zero `caps="all"` attributes across thirteen
slides — which is why the deck applies it inconsistently, with "WHO WE ARE" and
"How do we scale?" occupying the same role two slides apart. Typed caps cannot be
switched off, cannot be searched, and are read aloud as initialisms by screen
readers.

### Headline length

**Recommendation.** Extended uppercase type consumes horizontal space fast. Cap
`h1` at six words and `h2` at ten. This is a copy constraint that comes from a
typographic fact, and it belongs to whoever writes the headline.

### Deck type scale

**Observed.** The deck is 17″ × 9.583″, not the standard 13.333″ × 7.5″, and
every size in it is fractional — 15.31pt, 30.62pt, 40.83pt. Dividing out, the
deck was authored at 10″ × 5.625″ with clean integer sizes and then scaled 1.7×.
The underlying scale was 6 / 7 / 8 / 9 / 10 / 11 / 13 / 14 / 16 / 17 / 18 / 24 /
27 pt.

That resize is drift, not design. No deck should be built at 17″.

**Recommendation.** Build decks at **13.333″ × 7.5″** on this scale:

| Role | Size | Face |
|---|---|---|
| Cover headline | 36pt | Archivo Expanded |
| Closing statement | 32pt | Archivo Expanded |
| Slide title | 24pt | Archivo Expanded, uppercase |
| Stat callout | 21pt | Archivo Expanded |
| Section eyebrow | 12pt | Archivo Expanded, uppercase |
| Claim line | 12pt | Inter |
| Body | 11pt | Inter |
| Caption / card label | 8pt | Inter |

**Decision.** Three typefaces leaked into the deck through pasted content and are
not permitted: **Arial** (75 runs), **Montserrat** (20 — chart labels),
**Roboto** (16 — two partner names). Display is Archivo Expanded. Body is Inter.
Nothing else.

---

## 5. Layout

### Containers and rhythm

**Observed.** From the site.

| Property | Value |
|---|---|
| Container | 75em (1200px), centred |
| Container, wide | 85rem (1360px) |
| Section padding | 4rem block, 10px inline |
| Section padding ≤991px | inline 1.5rem |
| Section padding ≤479px | 3.5rem .5rem |
| Breakpoints | 479 / 767 / 991 (Webflow's) |
| Centred text block | `max-width: 45rem`, `margin: -18px auto 30px` |

**Recommendation.** The `-18px` top margin is a nudge someone applied to one
element and it propagated. Replace it with a spacing token during the migration.

### Alignment

**Decision.** Alignment differs by medium, and this is intentional.

| Centre | Left |
|---|---|
| Hero statements | Body copy and paragraphs |
| Section intros | Lists |
| Standalone statements under ~45rem | Card and cell contents |
| Page-level headlines | **All slide content** |

The site's centred default is one of its most defining characteristics and is
easy to lose in the migration — preserve it for hero and section-intro contexts.
But centring is a treatment for short statements, not a global rule. The deck is
left-aligned (184 paragraphs to 67), and that is correct: slides carry dense
content, and centred body text is harder to read at every length.

The rule, stated so it survives challenge: **centre short statements, left-align
everything you expect someone to read.**

### Spacing scale

**Observed.** Not currently defined. Neither artifact obeys a consistent spacing
system.

**Recommendation.** Adopt a 4px base: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96.
Most values already in use (8px, 16px, 32px, 4rem) land on it.

---

## 6. Components

### Logo wall

**Observed.** `.companies_grid` / `.company__link.new` / `.company__logo`

- 5 columns at `gap: 8px`; 2 columns at ≤991px, `gap: 10px`
- Cell: fixed `height: 144px`, white, `box-shadow: 0 0 0 1px #EBEBEB`, padding 2.5rem
- Logo: `filter: grayscale() brightness(82%)`, `object-fit: contain`,
  `min-width: 120px` (80px ≤479px)

**Decision.** The desaturation is a rule, not a style, and it carries a reason:
**no member's brand colour is allowed to dominate the wall.** OMA3 is a
credibly-neutral consortium and the logo wall has to look like one. A wall where
one member's red pulls the eye is making a claim OMA3 does not intend.

This rule was dropped in the deck — member logos there are full colour, with no
filter applied anywhere in the file. That is a regression, and the deck is wrong.
It applies in decks exactly as it applies on the site.

### Leadership card

**Observed.** `.team__list` / `.team__item`

- 3 columns, `column-gap: 16px`, `row-gap: 32px`; 2 columns ≤991px
- Portrait: `object-fit: cover`, `max-width: 300px`, `min-height: 300px`
- Name: `h3`, mixed case, `margin-bottom: 0`
- Role: `min-height: 40px`, `margin-bottom: 24px`, `#333333`
- Affiliation: pill

The `min-height: 40px` on the role exists so cards stay aligned when a title
wraps to two lines. It looks arbitrary and is not — keep it.

### Pill

**Observed.** `#333333` text on `#F5F5F5`, `border-radius: 23px`,
`padding: 10px 15px`.

**Recommendation.** The 23px radius is an arbitrary value that reads as fully
rounded at this height. Specify `border-radius: 999px` so it stays correct if the
padding changes.

### Buttons

**Observed.** Defined on the site; effectively absent from the deck, which
contains one rounded rectangle across thirteen slides.

**Decision.** Buttons come from the site. Primary action is `--dodger-blue`
(`#327CFF`) — note that this colour appears **zero times** in the deck, having
been replaced there by four unrelated blues.

**Recommendation.** Document the site's exact button padding, radius, hover, and
disabled states during the `oma3-landing` migration and record them here. They
are currently defined only in Webflow's output.

---

## 7. Imagery

### Member logos

See [Logo wall](#logo-wall). Desaturated, always, in every medium.

### Leadership portraits

**Observed.** All portraits are square (1:1), but they range from 272 × 272 to
1539 × 1539 — a 5.6× spread — and mix colour with black and white, studio with
snapshot. There is no spec.

**Recommendation.** Adopt one, and re-shoot or re-crop to meet it:

| Property | Value |
|---|---|
| Aspect | 1:1 |
| Minimum resolution | 800 × 800 |
| Delivered resolution | 1200 × 1200 |
| Treatment | Colour |
| Crop | Head and shoulders; eyes on the upper third |
| Background | Plain, light, uncluttered |
| Format | JPEG, quality 85 |

Colour over black and white is the call that matters: the current mix is the most
visible inconsistency on the site, and colour is the easier standard to hold new
people to.

### Hero footage

**Observed.** A 10-second 1280 × 720 looping video — a waterfall with a portal at
its centre (`oma-intro-transcode.mp4` 11.2MB / `.webm` 5.6MB, poster
`oma-intro-poster-00001.jpg`). Type sits over it in white. The deck reuses a
still frame from it as the title-slide background.

**Decision.** The footage is the brand's atmospheric anchor and carries the
portal motif. Reusing a still frame as a deck cover is correct and should
continue.

**Recommendation.** White type over the footage needs a scrim to stay legible —
the frame is bright in its upper half. Specify a dark overlay (20–30% black, or a
bottom-up gradient) under any type placed on it. Currently nothing defines this.

---

## 8. Voice and positioning

### Positioning

**Observed.** The site currently contradicts itself across three surfaces:

| Surface | Says |
|---|---|
| `<title>` / `og:title` | "Open infrastructure for the Spatial Web" |
| `<h1>` | "Building the Open Metaverse" |
| `<meta description>` | "OPEN STANDARDS AND INFRASTRUCTURE FOR AN INTERCONNECTED METAVERSE" |

**Decision.** The positioning is **"open technology for the spatial web."**

*Technology* is the operative word: it is the only term that covers
specifications, open source, and infrastructure together. "Standards" is too
narrow, "infrastructure" omits the specification work.

**Decision.** Do not describe OMA3 as building "the metaverse." That framing is
being deliberately moved away from. The 2026 deck already does this correctly —
it says "the open internet," "the spatial web," and "the machine-driven
internet," and never once says metaverse. On positioning, the deck is ahead of
the site.

### What this document does and does not govern

Voice, positioning language, and mechanical copy rules live here. The *content*
of any given page or deck does not — that is written separately, and for the
website lives in `oma3dao/oma3-landing`.

The split is: this document says **how OMA3 sounds**; a copy document says
**what a specific thing says**.

### Page titles

**Observed.** All 37 blog and newsletter pages share one `<title>`: "OMA3".

**Decision.** Every page title must contain the page's own subject and the
organisation, in that order: `<Subject> — OMA3`. No page may ship with a title
that is only the organisation name.

### Pre-publish check

**Observed.** The footer contains dead links (`href="#"`) and the contact form
placeholder reads "Your orginization name".

**Recommendation.** These are symptoms, not the problem. Add a pre-publish
checklist to the migration: no `href="#"`, spell-check all user-visible strings,
every page has a unique title, every image has alt text.

---

## 9. Contradictions and how they were resolved

Each of these was live and real. Recorded so a future reader can see a choice was
made.

### 9.1 The gradient was reversed

The site: 45°, `#7900FF` → `#327CFF` @49% → `#00F4D7`. The deck: 180°,
`#00FFD0` → `#9900FF` — opposite direction, no midpoint, and both endpoints
shifted. Four slides carried a broken three-stop variant with the middle stop at
position 100000, identical to the end stop, which renders as two stops.

**Resolved: the site wins.** The decisive evidence is the deck's own logo, whose
gradient runs violet → blue → turquoise. The deck contradicted itself.

### 9.2 The display typeface

The site uses an unlicensed Monument Extended. The deck substitutes Krona One.

**Resolved: neither.** Archivo Expanded, for the reasons in [§4](#4-typography).
The deck was right that the font had to change; Krona One's single weight was too
tight a constraint to adopt permanently.

### 9.3 Centred versus left alignment

The site centres by default. The deck is left-aligned 184 to 67.

**Resolved: both, by medium.** See [Alignment](#alignment). This was the one
apparent contradiction that turned out not to be one.

### 9.4 Member logo treatment

Site desaturates; deck does not.

**Resolved: the site wins,** because the rule has an argument behind it and the
deck simply dropped it.

### 9.5 Body text colour

Site `#333333`; deck `#2B2B2B`.

**Resolved: the site wins.** The deck value is drift. This is the most-used
colour in the deck — 204 occurrences — which is why an untokenised body colour is
worth fixing.

### 9.7 omatrust.org is a second design language

The OMATrust product site does not follow anything in this document. It is dark
where oma3.org is white, uses Inter with no display face at all, pairs it with
JetBrains Mono, and accents in cyan rather than violet. Its palette is also a
*designed* set — one hue family across ground, card and border with a single
accent — where OMA3's palette is a gradient pressed into service as a UI palette.

**Not resolved.** Two properties, two languages, and the newer one is in some
respects the better-built system. Three options, for OMA3 to choose between:

1. **Two documented brands.** OMA3 (corporate, light) and OMATrust (product,
   dark), each with its own guidelines and an explicit shared element — the
   wordmark, the gradient, and the display face in hero contexts only.
2. **Bring omatrust.org to this document.** Costs a redesign of a working site.
3. **Bring this document toward omatrust.org.** Costs oma3.org.

Option 1 is the usual answer for a consortium with a product, and it is what the
September 2026 deck assumes: built in omatrust.org's language, with the OMA3
wordmark and Archivo Expanded on the cover.

Whatever is chosen, **JetBrains Mono should be adopted org-wide as the monospace
face** — this document previously recorded no mono face at all, omatrust.org
already ships one, and it is free and cross-platform.

### 9.6 Positioning

Three statements across three surfaces. **Resolved** in
[§8](#8-voice-and-positioning). The site needs updating to match.

---

## 10. Not currently defined

Recorded so nobody assumes these were considered and omitted. Each has a
**Recommendation** above; none is settled.

| Area | Where |
|---|---|
| Logo clear space and minimum size | [§2](#clear-space-and-minimum-size) |
| Solid one-colour logo versions | [§2](#backgrounds) |
| Button padding, radius, and states | [§6](#buttons) |
| Icon style | **Partly resolved** — omatrust.org uses [lucide](https://lucide.dev). Recommend adopting it org-wide |
| Monospace face | **Resolved** — JetBrains Mono, per [§9.7](#97-omatrustorg-is-a-second-design-language) |
| Chart and data-visualisation colours | Nothing defined; the deck's charts use an ad-hoc palette |
| Spacing scale | [§5](#spacing-scale) |
| Portrait spec | [§7](#leadership-portraits) |
| Type treatment over video | [§7](#hero-footage) |
| Dark mode | Nothing defined anywhere |

---

## 11. Assets to commission

Ordered by how much is blocked on each.

1. **SVG wordmark and lockup.** ~~No vector version exists.~~ **An SVG wordmark
   already exists** at `oma3dao/omatrust-landing` →
   `public/images/oma3-logo.svg` (viewBox `0 0 158 42`, gradient-filled). It was
   never moved anywhere findable. Copy it to `brand/assets/`, confirm whether it
   includes the mark or only the wordmark, and commission the lockup if not.
2. **Solid one-colour logo versions** — white and `#333333`, wordmark and
   lockup. Needed for any placement on imagery.
3. **Leadership portraits to spec.** Re-shoot or re-crop to
   [§7](#leadership-portraits). The current 5.6× resolution spread and
   colour/black-and-white mix is the most visible inconsistency OMA3 has.
4. **Archivo Expanded weight mapping.** Not a commission — a decision. Test
   against the live site and record the result in [§4](#display-face--changing).
5. **Icon set.** A single family, one weight, one corner treatment. Currently
   every icon is sourced independently.
6. **Chart palette.** Derived from the gradient, tested for accessible contrast
   and for distinguishability in greyscale and by colour-blind viewers.
