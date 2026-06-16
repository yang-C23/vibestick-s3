# Security policy

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories ("Report a vulnerability") on
this repository, rather than opening a public issue. We aim to acknowledge within a few days.

## Security model

- **Secrets stay on the Mac.** AI/STT API keys live only in the bridge's `.env` / Keychain / shell
  env — **never** on the device, in firmware, or in the repo.
- **Local by default.** The bridge binds `127.0.0.1` / LAN only and exposes no public port. STT and
  normalization run locally unless the user explicitly enables a cloud provider.
- **Pairing.** Device ↔ bridge use a one-time 6-digit code → `deviceId` + `token`; the token is
  stored in device NVS and sent on every connect.
- **Log redaction.** Logs redact API keys, tokens, SSH keys, `.env` contents, and cookies.
- **Least data to the device.** Hooks/wrappers forward metadata + summaries, not full code diffs,
  unless the user opts in. The device receives normalized state only.
- **Injection safety.** Auto-paste requires explicit macOS Accessibility opt-in and never presses
  Enter. BLE-HID is off by default.

## Scope

Please do not include real secrets in bug reports — redact tokens, keys, and personal paths.
