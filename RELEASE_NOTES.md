# Release Notes: v0.3.1

## What's New Since v0.1.0

### Visual Email Tags (New!)
Emails with active reminders now display an orange **"Has Reminder"** tag directly in the message list and message header. This makes it easy to see at a glance which emails have reminders set.

- Tag appears automatically when you set a reminder
- Tag is removed when you complete, dismiss, or delete the reminder
- Tags sync automatically when Thunderbird restarts
- Enable the "Tags" column in your message list to see tags in the list view

### Toolbar Badge (New!)
The toolbar button now shows a badge with reminder counts in the format **pending|due**:
- **Blue badge** - You have pending/snoozed reminders
- **Orange badge** - You have reminders that are due now

### Other Improvements
- Reminder counts displayed in popup header
- Improved popup UI
- Updated minimum Thunderbird version to 106.0
- Comprehensive documentation added

## New Permissions

This version requires additional permissions:
- **messagesUpdate** - To add/remove tags on emails
- **messagesTags** - To create the custom "Has Reminder" tag

These permissions are used solely to manage the visual tag indicator on emails with reminders. No data is transmitted externally.

## Requirements
- Thunderbird 106 or later
