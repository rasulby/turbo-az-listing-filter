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

- Saved and Hidden entries are displayed alphabetically; matching models sort by year and engine, with broader rules first.
- Broader rules replace redundant narrower rules. Duplicate or already-covered rules are not added.
- The floating **Turbo Filter** panel offers individual **Remove** and **Restore**, plus confirmed **Remove All** and **Restore All** actions. Saved and Hidden lists are managed independently.
- Filters apply immediately to loaded cards and automatically to new cards during infinite scrolling. Restoring a rule re-evaluates loaded cards without a reload.
- Missing fields disable only the affected options. A Brand + Model rule can still match cards with no year or engine. Battery capacity is not treated as engine displacement.

The script operates only on the currently loaded page. It makes no requests for additional pages and leaves native pagination unchanged.

The menu closes after selection, on an outside click, or with Escape. There is no individual-advertisement saving or hiding.

## Storage and matching

Saved and Hidden preferences stay in browser `localStorage` under the existing `turbo-filter:v1` key. There is no backend, account, cloud storage, external synchronization, analytics, or telemetry. Data is separate per browser profile and Turbo.az origin; clearing site data removes it.

Turbo.az's dedicated vehicle-name field contains the brand and model together. The script retains that full name instead of guessing how to split multiword brands. Matching normalizes casing, whitespace, and decimal engine values. `Toyota Prius` does not match `Toyota Corolla`. Advertisement IDs and URLs are not stored or used as filter rules.

Saved entries contain `model` (the full brand/model name) and `year`. Hidden entries contain `model`, optionally `year`, and optionally `engine` when a year is present. Older stored rules remain compatible. Updating the script does not migrate or reset Saved or Hidden data.

Set `DEBUG` to `true` near the top of the script for console diagnostics.

## License

[MIT](LICENSE)
