# Turbo.az Listing Filter

A small userscript that reduces repetitive Turbo.az listings with locally saved vehicle configurations and hidden rules. Plain JavaScript and CSS; no dependencies or build step.

## Supported environment

The existing script has been tested in **Google Chrome + Violentmonkey on macOS**. The latest changes have automated DOM regression coverage; a browser check of this release is still pending. Other browsers and platforms are not claimed as tested.

## Install

1. Install and enable Violentmonkey in Chrome.
2. Open [`turbo-az-listing-filter.user.js`](turbo-az-listing-filter.user.js) on GitHub and select **Raw**.
3. Confirm **Install** in Violentmonkey, then reload Turbo.az.

Alternatively, choose **Create a new script** in Violentmonkey, replace the starter contents with the complete `.user.js` file, and save.

**Updating an existing installation:** edit the existing Turbo Filter script in Violentmonkey, replace its contents with this file, save, and reload. Existing saved entries and hidden rules are retained. Keep only one version enabled.

## Features

- **★** saves the vehicle's brand/model and year, with no duplicates. Its behavior is unchanged: listings with the same name and year share one saved entry.
- **🚫** opens a small menu with three hiding scopes:

  | Example option | Hides |
  | --- | --- |
  | Toyota Prius | All Toyota Prius listings, regardless of year or engine |
  | Toyota Prius — 2012 | All Toyota Prius 2012 listings, regardless of engine |
  | Toyota Prius — 2012 — 1.8 | Only Toyota Prius 2012 listings with a normalized 1.8-liter engine |

- Broader rules replace redundant narrower rules. Duplicate or already-covered rules are not added.
- The floating **Turbo Filter** panel offers individual **Remove** and **Restore**, plus confirmed **Remove All** and **Restore All** actions. Saved and Hidden lists are managed independently.
- Filters apply immediately to loaded cards and automatically to new cards during infinite scrolling. Restoring a rule re-evaluates loaded cards without a reload.
- On paginated result pages, auto-fill pulls matching listings from subsequent pages when fewer than 20 cards remain visible. Search parameters and native pagination are preserved.
- Missing fields disable only the affected options. A Brand + Model rule can still match cards with no year or engine. Battery capacity is not treated as engine displacement.

The menu closes after selection, on an outside click, or with Escape. There is no individual-advertisement saving or hiding.

## Auto-fill

`TARGET_VISIBLE_CARDS` (default **20**) and `MAX_EXTRA_PAGES` (default **10**) near the top of the script control auto-fill. Only one same-origin request runs at a time. Fetching stops at the target, the cumulative page limit for this page load, the end of results, or a failed request. Requests time out after 15 seconds.

Changing Hidden rules re-evaluates the loaded cards and refills as needed within the remaining limit. Fetched cards use the same filters and ★/🚫 controls. Extra and currently filtered candidates stay in memory for reuse after rule changes; only matching cards are appended. Pages without native result pagination are left alone.

## Storage and matching

All data stays in browser `localStorage` under the existing `turbo-filter:v1` key. There is no backend, account, cloud storage, external synchronization, analytics, or telemetry. Data is separate per browser profile and Turbo.az origin; clearing site data removes it.

Turbo.az's dedicated vehicle-name field contains the brand and model together. The script retains that full name instead of guessing how to split multiword brands. Matching normalizes casing, whitespace, and decimal engine values. `Toyota Prius` does not match `Toyota Corolla`. Advertisement IDs are used only in memory to prevent duplicate appended listings; they are never persisted or used as hiding rules.

Saved entries contain `model` (the full brand/model name) and `year`. Hidden entries contain `model`, optionally `year`, and optionally `engine` when a year is present. Older stored rules remain compatible. Auto-fill does not write, migrate, or reset Saved or Hidden data.

Set `DEBUG` to `true` near the top of the script for console diagnostics.

## License

[MIT](LICENSE)
