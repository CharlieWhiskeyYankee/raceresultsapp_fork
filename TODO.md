# Code Quality TODO

Items marked ✅ have been implemented. The rest are open.

---

## ✅ #8 — Replace inline innerHTML interpolation with escapeHtml

Added `escapeHtml(value)` to `utils.js`. Applied to every user-supplied string
(sail numbers, skipper names, boat classes, series names, elapsed times) in all
`innerHTML` template literals across `ui.js`.

---

## ✅ #9 — Remove hardcoded client-side password from inline code

The access word is now stored in a named constant `ACCESS_WORD` in `app.js`
with a clear comment explaining it is not a security mechanism. See the comment
for guidance on moving authentication to the Google Apps Script layer if real
security is needed.

---

## ✅ #7 — Persist short-course session across page reloads

Added `session.js` with `saveSessionToStorage()`, `restoreSessionFromStorage()`,
and `clearSessionStorage()`. Session is saved after every meaningful mutation
(race creation, removal, finish times, start times). Restored automatically on
app init after cloud data loads and validated against the loaded series list.
Session is cleared when the user saves or clears it deliberately. If a session
is restored, the app navigates straight to the Race Entry tab and shows a toast.

---

## ✅ #6 — Replace confirm() / alert() with non-blocking modal and toast

Added `modal.js` with:
- `showConfirm(message, options)` → `Promise<boolean>` — styled modal with
  Confirm/Cancel, supports `danger` mode (red confirm button) and custom labels.
- `showAlert(message, options)` → `Promise<void>` — styled modal with OK.
- `showToast(message, type, duration)` — brief non-blocking bottom-of-screen
  notification. Types: `info`, `success`, `warning`, `error`.

All `alert()` and `confirm()` calls replaced in `handlers.js`, `storage.js`,
and `app.js`. All affected handler functions converted to `async`.

---

## ✅ #5 — Proper error handling for the Google Sheets API

`storage.js` now:
- Reports all errors via `showToast` (non-blocking) instead of `alert()`.
- Uses **exponential backoff** on network failures: base 5 s, doubles each
  attempt, capped at `SAVE_RETRY_MAX = 5` attempts. Each retry shows a toast
  with a countdown.
- After exhausting retries, surfaces a persistent error in the save-status
  badge and a 12-second toast explaining data is safe locally.
- Distinguishes recoverable network errors (retry) from definitive API errors
  (don't retry, surface immediately).
- Cancels pending retries when a fresh `triggerSave()` is called with new data.

---

## ✅ #2 — Convert to ES modules (`type="module"`)

All JS files now use `export`/`import`. `index.html` loads only a single
`<script type="module" src="js/app.js">`. Load-order `<script>` tags are gone.
Each file explicitly declares its dependencies via `import`. The shared global
scope is eliminated — name collisions between files are now impossible.

`state.js` exports a single `state` object whose properties are mutated
directly by importers (`state.entries.push(...)`, `state.currentSeries = x`),
which is the cleanest pattern for mutable shared state without setter boilerplate.

---

## ✅ #1 — Replace inline `onclick` attributes with event delegation

Done as part of #2 (the two had to land together). All `onclick=` attributes
have been removed from rendered HTML in `ui.js` and from `index.html`.
All `window.xxx = handler` assignments have been removed from `app.js`.

Rendered elements now carry `data-action` and `data-*` index attributes.
`app.js` attaches one delegated listener per stable container via `_delegate()`,
which routes to the correct handler by reading `data-action`. The only exception
is `window._afterImport`, a one-line hook that lets `storage.js` trigger a UI
refresh without importing from `ui.js` (which would create a circular dependency).

---

## 3. Centralise state mutation — eliminate direct array mutation across files

**Why it matters**
`entries`, `series`, `boatList`, and `shortCourseSessionRaces` are mutated
directly in `handlers.js`, `storage.js`, and `ui.js`. This makes it very hard
to trace where a bug originates and prevents any future move to reactive state
or undo/redo.

**What to do**
Define explicit setter/action functions in `state.js` (e.g.
`addEntry(entry)`, `removeEntry(index)`, `setSeries(data)`) and enforce that
only these functions mutate state. All other modules call these functions.
This also makes it trivial to add a save-on-every-mutation hook in one place.

---

## 4. Extract HTML templates out of `ui.js`

**Why it matters**
`ui.js` contains large multi-line template literals that mix HTML structure
with JS logic. This makes the rendering functions hard to read, and makes
it impossible to preview or edit the HTML in isolation.

**What to do**
Either use `<template>` elements in `index.html` and clone them in JS, or
extract a small `templates.js` module that exposes pure functions returning
HTML strings. Rendering functions in `ui.js` should call these and focus only
on the data-binding logic.


Tracked improvements that are impactful enough to warrant a deliberate refactor
rather than an inline fix.  Listed roughly in priority order.

---

## 1. Replace inline `onclick` attributes with proper event delegation

**Why it matters**
The rendered HTML in `ui.js` (e.g. `renderEntriesTable`, `renderShortCourseSessionRaces`)
emits strings like `onclick="handleFinButtonClick(this, 0)"`.  This requires
polluting `window` with handler references in `app.js`, couples the rendering
layer tightly to the handler layer, and makes it impossible to remove global
scope pollution.  It also breaks Content Security Policy headers if those are
ever added.

**What to do**
Use event delegation on stable parent elements (e.g. `#entries-body`,
`#short-course-races-container`).  Read the action and index from `data-*`
attributes on each row/cell.  Remove all `window.xxx = ...` assignments from
`app.js` and all `onclick=` attributes from `ui.js`.

---

## 2. Convert to ES modules (`type="module"`)

**Why it matters**
All JS files currently share a single global scope and depend on load-order
declared in `index.html`.  Any variable name collision across files causes a
silent bug.  There is no encapsulation.

**What to do**
Add `type="module"` to the `<script src="js/app.js">` tag (the single entry
point) and convert each file to use `export`/`import`.  The load-order
`<script>` tags in `index.html` can be reduced to just `app.js`.  State
variables (`entries`, `series`, etc.) should be imported where needed rather
than accessed as globals.

---

## 3. Centralise state mutation — eliminate direct array mutation across files

**Why it matters**
`entries`, `series`, `boatList`, and `shortCourseSessionRaces` are mutated
directly in `handlers.js`, `storage.js`, and `ui.js`.  This makes it very hard
to trace where a bug originates and prevents any future move to reactive state
or undo/redo.

**What to do**
Define explicit setter/action functions in `state.js` (e.g.
`addEntry(entry)`, `removeEntry(index)`, `setSeries(data)`) and enforce that
only these functions mutate state.  All other modules call these functions.
This also makes it trivial to add a save-on-every-mutation hook in one place.

---

## 4. Extract HTML templates out of `ui.js`

**Why it matters**
`ui.js` contains large multi-line template literals that mix HTML structure
with JS logic.  This makes the rendering functions hard to read, and makes
it impossible to preview or edit the HTML in isolation.

**What to do**
Either use `<template>` elements in `index.html` and clone them in JS, or
extract a small `templates.js` module that exposes pure functions returning
HTML strings.  Rendering functions in `ui.js` should call these and focus only
on the data-binding logic.

---

## 5. Introduce proper error handling for the Google Sheets API

**Why it matters**
`storage.js` uses `alert()` for all save and load errors, which blocks the UI
thread and is jarring.  Failures during a timed race (when the UI should stay
responsive) are particularly disruptive.  The retry on save failure is also a
blunt 10-second `setTimeout` with no max-retry cap.

**What to do**
Replace `alert()` calls in `storage.js` with a non-blocking in-page
notification (a toast or dismissible banner).  Add an exponential-backoff retry
strategy with a maximum attempt count.  Distinguish between recoverable network
failures and definitive API errors.

---

## 6. Replace `confirm()` dialogs with non-blocking confirmations

**Why it matters**
There are ~15 `confirm()` calls spread across `handlers.js`.  These block the
main thread, look inconsistent across browsers and OSes, and cannot be styled.
On mobile browsers some environments suppress `confirm()` entirely.

**What to do**
Build a small `modal.js` utility that returns a `Promise<boolean>` and renders
a styled confirmation dialog inside the page.  Replace every `confirm()` call
with `await showConfirm(message)`.  (Requires handlers to be `async`.)

---

## 7. Persist short-course session state across page reloads

**Why it matters**
`shortCourseSessionRaces` is session-only.  If the page is accidentally
refreshed mid-race the entire unsaved session is lost.  This is a real risk
when the device is used on a boat or handed between race officers.

**What to do**
Serialize `shortCourseSessionRaces` to `sessionStorage` after every
mutation.  Restore from `sessionStorage` on app init (before loading from
Google Sheets).  Add a clear-session-storage call when the user deliberately
saves or clears the session.

---

## 8. Add input validation and sanitisation to rendered table HTML

**Why it matters**
`ui.js` interpolates values like `entry.sailNumber` and `entry.skipper`
directly into `innerHTML` strings without escaping.  If a boat's name contained
`<script>` or `"onclick="...` the rendered table would be vulnerable to
stored XSS.

**What to do**
Create a small `escapeHtml(str)` utility in `utils.js` and apply it to every
user-supplied string interpolated into innerHTML.  Alternatively, switch
table-building to DOM API calls (`createElement`, `textContent`) which are
immune by design.

---

## 9. Remove hardcoded `'results'` access password from client-side code

**Why it matters**
The gate password check (`accessWordInput.value.trim().toLowerCase() === 'results'`)
is visible to anyone who opens DevTools.  It provides no real security.

**What to do**
If security is genuinely needed, move authentication to the Google Apps Script
layer (e.g. check a token on each request).  If the gate is only intended to
prevent accidental access, document that clearly in the code and consider
replacing it with a URL parameter or a simple cookie so it does not gate
returning users every time.
