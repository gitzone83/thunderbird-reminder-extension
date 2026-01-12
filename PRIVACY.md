# Privacy Policy for Email Reminders Extension

**Last updated:** January 9, 2025

## Overview

Email Reminders is a Thunderbird extension that allows you to set reminders for emails. This privacy policy explains how the extension handles your data.

## Data Collection

**This extension does NOT collect, transmit, or share any personal data.**

## Data Storage

All data is stored **locally on your device** using Thunderbird's built-in storage API (`browser.storage.local`). This includes:

- Reminder metadata (due dates, notes, status)
- Email references (subject lines, sender addresses, message IDs)
- Your extension preferences/settings

This data:
- Never leaves your computer
- Is not transmitted to any external servers
- Is not accessible to the extension developer or any third parties
- Is stored only within your Thunderbird profile

## Data Retention

- Reminder data persists until you delete it or uninstall the extension
- You can export your reminders as a JSON file via the Settings page
- You can clear all data at any time via the Settings page

## Permissions

The extension requests the following permissions:

| Permission | Purpose |
|------------|---------|
| `storage` | Store reminders and settings locally |
| `alarms` | Schedule reminder notifications |
| `notifications` | Display system notifications when reminders are due |
| `menus` | Add "Set Reminder" to the right-click context menu |
| `messagesRead` | Read email metadata (subject, sender) to display in reminders |
| `accountsRead` | Access folder structure to locate emails |

## Third-Party Services

This extension does **not** use any third-party services, analytics, or tracking.

## Changes to This Policy

Any changes to this privacy policy will be reflected in the extension update notes and this document.

## Contact

If you have questions about this privacy policy, please open an issue on the project repository or contact the developer.

---

**Summary:** Your data stays on your device. We don't collect, see, or share anything.
