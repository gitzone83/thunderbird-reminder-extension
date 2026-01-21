# Changelog

All notable changes to Email Reminders for Thunderbird will be documented in this file.

## [0.3.1] - 2026-01-21

### Changed
- Cleaned up debug logging for production release
- Updated minimum Thunderbird version to 106.0

### Added
- Comprehensive add-on listing documentation (LISTING.md, LISTING.html)
- Updated README with new features and screenshots section

## [0.3.0] - 2026-01-21

### Added
- **Visual email tags** - Emails with active reminders now display an orange "Has Reminder" tag in the message list and message header
- Tag is automatically added when setting a reminder
- Tag is automatically removed when completing, dismissing, or deleting a reminder
- Tags sync on Thunderbird startup to ensure consistency
- Support for multiple reminders per email (tag only removed when all reminders are resolved)

### Changed
- Added `messagesUpdate` permission to enable tag management
- Added `messagesTags` permission to create custom tags

## [0.2.0] - 2026-01-21

### Added
- **Toolbar badge** showing reminder counts in format `pending|due`
- Blue badge color for pending reminders
- Orange badge color when reminders are due
- Reminder counts displayed in popup header

### Changed
- Improved popup UI with count display

## [0.1.0] - 2026-01-21

### Added
- Initial release
- Set reminders on emails via right-click context menu
- Quick reminder options (1 hour, 4 hours, Tomorrow, Next Week)
- Custom date/time picker for precise scheduling
- Optional notes field for reminders
- System notifications when reminders are due
- Click notification to open the original email
- Snooze reminders (5 min, 15 min, 1 hour, 4 hours, 1 day, 1 week)
- Mark reminders as complete
- Dismiss reminders
- Toolbar popup showing active reminders
- Full reminder list page with filtering (Active, Completed, Dismissed)
- Settings page with:
  - Export reminders to JSON
  - Import reminders from JSON
  - Clear all reminder data
- 100% local storage - no data transmitted externally
- Internationalization support (English)
