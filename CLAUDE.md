# Working on this project

This is a family's live farm planner. Other people use it every day, so changes must never break it or lose data.

Rules for every change:
1. Build new features in `beta/` first (run `sh tools/start-test.sh` if `beta/` is out of date with the live files). Never edit the root `index.html`, `css/` or `js/` directly for a new feature.
2. Run `node tests/run.mjs` and make it pass. Add a check for any new data field or behaviour.
3. Data format changes go in `beta/js/schema.js`: add defaults for new fields, and if anything is renamed or removed, bump `SCHEMA` and handle the old shape in `migrate()`. Never write code that assumes every saved item already has a new field.
4. Never modify or delete farm data in Firebase from code paths other than the user's own actions. Whole-farm replacements must go through `store.replaceAll()`, which takes a backup first.
5. After the owner has tried the change at `/beta/`, run `sh tools/promote.sh`, update `CHANGELOG.md` and `APP_VERSION` in `js/config.js`, then commit and push to `main`.
6. Keep `js/config.js` Firebase values as they are. They are public by design. Access is controlled by `firestore.rules` and the family link's random code. Never log, commit or print a family link.
