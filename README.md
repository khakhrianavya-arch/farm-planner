# Farm Planner 3D

A shared 3D model of the farm: buildings, trees (by species), ponds, garden beds and paths,
with live weather and seasons for the farm's location. Anyone with the private family link can see and edit
the same farm, live. No accounts or passwords.

- **Live version:** `https://<username>.github.io/farm-planner/`
- **Test version:** `https://<username>.github.io/farm-planner/beta/`. It uses a separate *test farm*, so nothing tried there touches the real one.

## How it's built

| Part | What it does |
|---|---|
| `index.html`, `css/` | Page layout and styling |
| `js/main.js` | The 3D editor: tools, dragging, side panel, weather bar |
| `js/items3d.js` | The 3D model for each kind of object |
| `js/schema.js` | The farm data format, defaults, species list, and `migrate()` for older data |
| `js/store.js` | Saving: Firebase (shared, live) or this browser only (offline mode) |
| `js/weather.js`, `js/seasons.js` | Open-Meteo weather and hemisphere-aware seasons |
| `js/config.js` | Firebase connection settings |
| `js/link.js` | Making and reading family links |
| `firestore.rules` | Database rules: farms open only to people with the link (pasted into the Firebase console) |
| `tests/run.mjs` | Automatic checks. GitHub runs them before every publish. |

The farm itself (every tree, pond and building) lives in the Firebase database, **not** in this code.
Updating the code never changes the farm.

## Safety net

1. **Checks before publishing.** If any check in `tests/run.mjs` fails, GitHub doesn't publish and the live site stays as it was.
2. **Test version first.** New features are built in `beta/` and tried at `/beta/`. `tools/promote.sh` makes them live.
3. **Undo any update.** Every change is a commit. Reverting the commit puts the previous version back.
4. **Backups of the farm.** The app saves a daily snapshot (plus one before every import, restore or clear). Restore from *Farm panel → Backups*.
5. **Old data keeps working.** `schema.js` gives every farm a version number, and `migrate()` upgrades older data when new fields are added.

## Sharing with family

Open the live site → *Farm panel → Sharing → Create family link* → *Copy*, and send the link to family.
Anyone with the link can edit, so share it only with people you trust. If something goes wrong,
*Backups* can restore the farm. Old backups can't be deleted from the app for 30 days.
