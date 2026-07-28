# #pulse-help preservation review — purge remains BLOCKED

Export: `docs/pulse-help-export-1785266058988.json` (85 messages, full metadata).
**No purge has run and none is authorised by this document.**

## The six human messages — all TEXT ONLY, zero attachments

| Message ID | Author | Date | Text | Attachment | Recommendation |
|---|---|---|---|---|---|
| `1522998939106672783` | fibersales | 2026-07-04 | "4 on the 4TH incentive: $100 ZELLE STRAIGHT TO THEIR BANK ACCOUNT" | none | **Discard** — a one-off July 4th incentive, already expired |
| `1522998795351228557` | fibersales | 2026-07-04 | "@everyone BIGGEST KNOCKING DAY OF THE YEAR. Happy 250 years to America" | none | **Discard** — dated hype |
| `1511035668548030567` | fibersales | 2026-06-01 | "@everyone Change discord names to actual names" | none | **Discard** — superseded; the Set-My-Name flow now enforces this |
| `1504550775056109710` | fibersales | 2026-05-14 | "🦖🦖🦖" | none | **Discard** |
| `1504550745926795275` | fibersales | 2026-05-14 | "T-REXXXXX" | none | **Discard** |
| `1504362575096188979` | fibersales | 2026-05-14 | "The start of something new" | none | **Repost** — the server's first message. Sentimental value; suggest reposting to `#wins` or pinning in `#announcements` before the purge |

**No business, training, operational or compliance content.** Every one is already captured
verbatim in the export JSON, so text survives regardless.

## The 79 bot messages

All 79 are Sapphire welcome cards, every attachment named `image0_0.png` — a generated banner with
a username on it. **No business purpose. Do not download.** Preserving 79 auto-generated images
because they happen to be attachments would be archiving noise.

## Conclusion

**Nothing requires downloading before a purge.** The only judgement call is message
`1504362575096188979` ("The start of something new") — repost it somewhere permanent if you want to
keep it, then the channel can be cleared.

## Purge preview (NOT executed)

```
channel:  #pulse-help  (id 1504331974163169474)
delete:   85 messages  (79 bot + 6 human)
keep:     nothing in place — export retained at docs/pulse-help-export-*.json
after:    rename to #pulse-commands, pin one command reference
```

⚠ Discord bulk-delete cannot remove messages older than **14 days**. The oldest here is
2026-05-14, so a bulk purge will fail on most of them — they need individual deletion, which is
slow and rate-limited. **Deleting and recreating the channel is not an option**: the channel id
`1504331974163169474` is referenced in the Pulse config and in `#welcome` copy.

Given that, the honest recommendation is: **rename to `#pulse-commands`, pin the command reference,
and leave the old messages.** They sink below the pin and cost nothing. Purging 85 messages
one-by-one to tidy a channel nobody reads is effort without a return.
