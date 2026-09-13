# Daily Command foundation

This is a shared, read-only projection for the HQ home page.

## Contract
Each company may provide a lightweight action with:
`id, title, source, owner, href, due, state, urgency, waiting, relief`.

The original company remains the source of truth. The daily command does not write back or duplicate the record.

## View
- **Now**: the most urgent actionable item.
- **Today**: maximum three actions.
- **Tomorrow / day after**: dated actions only.
- **Waiting**: visible separately with the owner.
- **Relief**: when more than three actions are due today, candidates to defer are returned.

Calendar integration should translate confirmed calendar events into inputs. It must never create calendar events from this layer.
