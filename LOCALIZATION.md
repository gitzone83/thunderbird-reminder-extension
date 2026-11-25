# Localization

The extension uses the native WebExtension `browser.i18n` API, with English
(`default_locale: en`) as the fallback. Russian is provided in `_locales/ru`.
The runtime has no third-party dependencies and needs no additional permissions.

## Add a language

1. Copy `_locales/en/messages.json` to `_locales/<locale>/messages.json` using a
   [supported WebExtension locale identifier](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization).
2. Translate each `message`. Keep the keys and `placeholders` definitions intact.
   Named tokens such as `$TIME$`, `$SENDER$` and `$COUNT$` may be moved within the
   translated sentence; do not translate their names. `description` and `example`
   fields are translator notes, not interface text.
3. Run `node scripts/check-locales.mjs`. It requires matching keys, nonempty
   messages and identical substitution definitions across all shipped locales.
4. Load the extension in Thunderbird with that UI language and check all four
   pages, notifications and the context menu. Also verify the English fallback.

No JavaScript language list needs updating. Thunderbird selects the dictionary;
`Intl` uses the Thunderbird UI locale to format dates and relative time. An
unsupported UI language uses English messages while retaining that locale's
native date/time conventions.

## Add a message

Add the same key to every shipped dictionary. In JavaScript use
`I18n.message("key")` or `I18n.message("key", [firstValue, secondValue])`.
Load `i18n.js` before a page's own script. The background page also loads it first.

For HTML use `data-i18n="key"` on a text-only element. For attributes use
`data-i18n-title`, `data-i18n-placeholder` or `data-i18n-aria-label`.
The shared helper sets `lang` and `dir` at DOMContentLoaded, before page setup.
It assigns text via `textContent`, never translated HTML. Put labels in separate
spans when a container also contains controls, counts or other child elements.

Translate full sentences rather than concatenating fragments. Use placeholders
for user-supplied data. Use `I18n.formatRelativeTime` for elapsed/future time;
`Intl.RelativeTimeFormat` handles language-specific grammatical forms. For other
counts, use a neutral label such as "Reminders imported: $COUNT$" or introduce
explicit plural keys selected with `Intl.PluralRules` when needed.

## Context and compatibility

- `pending`, `snoozed`, `due`, `completed` and `dismissed` are visible status labels;
  `dueColumn` is the table heading. `done` is also used by the completion button.
- `dismiss` dismisses a reminder; it does not delete the email.
- `oneMinute`, `twoMinutes`, `fiveMinutes` and `tenMinutes` are interval choices;
  some duration labels also appear in snooze menus.
- `tomorrowMorning` describes the existing 09:00 quick option. Localization does
  not change scheduling logic or timezone handling.
- Translate display labels only. Never translate status values, DOM IDs, message
  actions, storage keys, ISO timestamps, sender addresses, email subjects or notes.
- New missing-subject/sender values are stored empty and translated on display.
  Existing saved subjects and notes, including old placeholder strings, are not
  rewritten because they may be genuine email/user content.
- The `reminder` tag key stays unchanged. The original "Has Reminder" label and
  the last automatically assigned label follow the UI language on startup.
  A user-renamed tag and its color are preserved. Both legacy and modern tag APIs
  are supported.
- Diagnostic console messages remain English; user-facing messages are localized.

## Checks

Node.js 18+ (no dependencies):

```sh
node scripts/check-locales.mjs
node --test tests/i18n.test.cjs
```

Optional browser smoke test with Playwright:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/ui-smoke.cjs
```

Alternatively set `CHROMIUM_PATH` to an installed Chromium executable. Set
`SCREENSHOT_DIR` to save screenshots outside the source tree. This test uses
mocked Thunderbird APIs and isolated contexts, covering all four pages in
English, Russian and an unsupported locale. It does not access mail profiles.
It complements, rather than replaces, validation in Thunderbird.

Manual Thunderbird checklist:

- Install the XPI or load `manifest.json` temporarily in a separate test profile.
- With Russian and English UI languages, inspect add-on metadata, toolbar tooltip,
  context menu, popup, creation dialog, full list, settings and notifications.
- Create, snooze, complete, dismiss and reactivate reminders. Check due times,
  missing subject/sender, notes, import/export and destructive-action prompts.
- Check relative times for 1, 2, 5, 11 and 21 minutes and dates around midnight.
- Switch locale and restart: the managed tag follows it; a custom tag name stays.
- Check button wrapping and scroll access with long translations.

Build an installable XPI using `python3 scripts/build-xpi.py`. This is a local,
unsigned package; no store publication or signing is performed by the script.
