# PWA and profile acceptance

Date: 2026-10-16. Browser: **BrowserOS Neo only**, chiplusmoney. Live Firebase Hosting origin.

## VERIFIED

- One top avatar uses the real Google photo (initials are the fallback if unavailable). It opens the account dropdown. Profile is absent from both navigation menus; Settings replaces it. The footer slogan was removed.
- Dropdown actions: My profile, Account security, Settings & preferences, Notifications, Export my data, Sign out. Native ArrowDown changes focus; Escape closes and restores trigger focus. On mobile the dropdown fits the viewport. Routes close the menu.
- Profile shows actual account/provider security information and the Google security link. Password-reset and verification controls are conditional on the actual provider/account state; no unsolicited email was sent.
- Settings saves country/skills to the owner's Firestore profile. Real export downloaded JSON with one saved application and zero earnings; no credential fields. Export explicitly selects fields and never serializes the Auth user.
- Earnings show $0.00 and no invented trend or success percentage. Only recorded payment receipts affect earnings. Application state is a genuinely saved record, not projected catalog rows.
- Desktop 1440×1000, tablet 820×1180, mobile 390×844: inspected screenshots, no horizontal overflow. Evidence: `verification/desktop-earnings.png`, `tablet-earnings.png`, `mobile-earnings.png`.
- Telegram delivery receipt visibly appeared; Mark read and Delete succeeded. Screenshot: `verification/desktop-notification.png`.
- Active service worker `/sw.js`, cache `ntk-income-hunter-m5b-hardened-v2`. Cache Storage holds public same-origin assets only. Custom IndexedDB version 3 contains only the public opportunity store.
- Full offline reload rendered 50 cached public opportunities. Private earnings showed a reconnect error rather than a false zero. Reconnecting restored server-confirmed private reads. Browser was returned online.
- Cache audit found no current scheduler secret or private-key block in cached responses/public records. Legacy Firestore cache had no pending mutations and was removed; the Auth session was preserved.

## Limits

This is browser/device emulation in the real Neo browser, not physical-device certification. The browser was restored from a minimized window before the final native controls and screenshots were tested. The AI assistant page is an existing interface scaffold; no live AI analysis is configured or claimed. No M6 features were added. Automatic cron operation remains blocked by Cloudflare account access, independent of the UI checks.
