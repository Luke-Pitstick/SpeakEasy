# SpeakEasy site design language

The site should read like a well-kept reference manual: flat, quiet, and quick to scan. Its
structure follows the uv documentation. The home page is a docs page like any other, with the
sidebar visible and **Introduction** as the first entry. A coloured band runs across the top with
search in the middle and the repository and its stars on the right. Navigation sits on the left
and page contents on the right. The colours, type, and the one illustrative figure are
SpeakEasy's own.

The tokens live in `src/styles/theme.css`. Use the tokens; do not write raw hex values in pages or
components.

## Principles

1. **Flat.** No shadows, no gradients, no cards floating on cards. Things are separated by
   whitespace first and a 1px light blue border second. Every corner uses the same 4px radius.
2. **Readable first.** Visitors may have low vision, use a screen magnifier, or read at a distance
   from a mounted screen. Body text is 17px with a line height of 1.7. Body text, headings, links,
   and buttons have at least 7:1 contrast; muted secondary text has at least 4.5:1.
3. **Selectable by gaze.** Some visitors point with an eye tracker or head pointer. Anything meant
   to be selected is at least 48px tall where it stands alone, has space around it, and never
   depends on hover to reveal something.
4. **One bold element per page, at most.** On the home page it is the initials figure. Everything
   else is plain prose, lists, tables, and code.
5. **Honest.** The site describes what the app does today. Unverified hardware and unmeasured
   speed are labelled as such. No testimonials, user counts, or speed claims without a recorded
   measurement.

## Colour

Three roles, in order of how much of the screen they cover.

| Role      | Covers                                                          | Tokens                                          |
| --------- | --------------------------------------------------------------- | ----------------------------------------------- |
| Primary   | Page and sidebar background. Most of every screen is white.     | `--se-paper`                                    |
| Secondary | Header band, table headers, figure panels, inline code, borders | `--se-sky-50`, `--se-sky-100`, `--se-sky-200`   |
| Tertiary  | Buttons, links, headings, the current page, the initials        | `--se-navy-600`, `--se-navy-700`, `--se-navy-900` |

Navy never fills a large area. If something is navy and not a heading, it can be selected.

| Token            | Value     | Use                                                    |
| ---------------- | --------- | ------------------------------------------------------ |
| `--se-paper`     | `#ffffff` | Page and sidebar                                       |
| `--se-sky-50`    | `#f4f9fe` | Table headers, figure panels, notes                    |
| `--se-sky-100`   | `#e6f1fc` | Header band, inline code                               |
| `--se-sky-200`   | `#cfe3f7` | Borders and dividers                                   |
| `--se-sky-300`   | `#a9cbee` | Links and accents in the dark theme only               |
| `--se-navy-500`  | `#1f5fae` | Focus ring                                             |
| `--se-navy-600`  | `#1b4f8f` | Links, current page (8.2:1 on white)                   |
| `--se-navy-700`  | `#143c70` | Buttons (11.0:1 on white)                              |
| `--se-navy-900`  | `#0b2545` | Headings, site title (13.5:1 on the header band)       |
| `--se-ink`       | `#14233a` | Body text (15.8:1 on white)                            |
| `--se-ink-muted` | `#4b5e78` | Captions and secondary text (6.6:1 on white)           |
| field border     | `#6b809c` | Outlines of the search field and secondary buttons (3.5:1, the minimum for an input outline) |

In components, use the semantic tokens, which switch with the theme: `--se-surface`,
`--se-border`, `--se-field-border`, `--se-heading`, `--se-button-bg`, `--se-button-bg-hover`,
`--se-button-text`, plus Starlight's `--sl-color-text`, `--sl-color-text-accent` (links),
`--sl-color-gray-3` (muted text), `--sl-color-white` (strongest text), and `--sl-color-bg`.

Rules:

- Sky tones are fills and borders. Never set text in a sky tone on white.
- Status is a word, not a colour or a badge.
- The site starts in the light theme whatever the operating system prefers. A dark theme (deep
  navy page, sky links) is one toggle away in the header and is remembered once chosen.

## Type

- **Family:** Atkinson Hyperlegible for everything, self-hosted. The Braille Institute designed it
  to keep similar letterforms distinct, which suits this audience. Code uses the system monospace
  stack.
- **Weights:** 400 and 700 only.
- **Scale:** body 17px; h1 36px; h2 26px; h3 21px; h4 18px. No display sizes outside the
  initials figure.
- **Headings:** navy-900, weight 700, sentence case, no rules under them.
- **Measure:** prose stays under 46rem wide.

## Layout

- Everything is left aligned, including the home page.
- The home page order is: title, one-paragraph description, the initials figure, two buttons,
  Highlights, Installation, What it looks like, Ways to point, Credits.
- Prefer a list or a table to a grid of boxes.

## Components

- **Header:** sky-100 band, 60px, 1px sky-200 rule underneath. Site name on the left, with no
  logo. On the right: search, the repository name with its star count, then the theme toggle.
- **Sidebar:** white, with no border along its edge and no guide lines beside nested items. On
  wide screens it sits 40px in from the window edge, aligned with the site name. Section names
  are larger regular-weight text that collapse their section, with a muted chevron on the right.
  Page links are regular text; the current page is bold navy text, with no fill or bar.
- **Buttons:** Starlight's `LinkButton`. Primary is filled navy with white text. Secondary is
  outlined in the field border colour with navy text. Wrap a row of buttons in `se-actions`.
- **Tables:** sky-50 header row, 1px sky-200 borders, no zebra striping.
- **Code blocks:** 1px border, 4px radius, no shadow.
- **Figures:** `se-figure` around an image gives it a 1px border and a muted caption.
- **Notes:** sky-50 fill with a navy bar. Caution and danger keep Starlight's warning colours.
- **Focus:** a 3px navy-500 ring with a 2px white gap, on every focusable element.
- **Links in prose:** navy-600 and always underlined.
- **Media:** video never autoplays and always has captions and visible controls.

## Voice

- Plain, direct sentences in the second person. Say what a control does, then when to change it.
- Name controls exactly as the app labels them, in bold: **Menu → Settings → General**.
- Use "eye tracker", "webcam gaze", "head pointer", and "dwell" consistently.
- Do not use the em dash character. Use a plain hyphen or rewrite the sentence.
- No arrows appended to link or button text, and no labels in capitals above headings.
- Do not describe planned features as available.

## Links and the deploy base

The site is served under `/SpeakEasy/` on GitHub Pages and from `/` locally. In Markdown, link
between pages with relative paths (`../quick-start/`) so both work. Do not write site-absolute
paths.
