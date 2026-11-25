# CAPON requested updates

- Registration now detects a username identical to the email address and shows a clear validation message. API errors containing structured validation objects are formatted as readable text instead of `[object Object]`.
- Removed the three feature labels from the login hero section.
- Documented the Render cold-start limitation: Render's own wake/processing screen cannot be removed in application code; an always-on instance is required to avoid free-tier spin-down delays.
- Optimization now compares promoter/ratio formulations represented in the supplied training dataset for each top process candidate and displays the highest model-scored formulation plus the top comparisons. These are screening predictions, not experimental validation.

## Validation

- Python syntax compilation passed for the modified optimization router.
- Babel parser syntax checks passed for all modified JavaScript/JSX files.
- Full frontend test/build could not be run in this environment because the uploaded `node_modules` tree is missing the platform-specific optional dependency `@rollup/rollup-linux-x64-gnu`; the regular `npm test` launcher also lacks execute permission. Run `npm ci`, then `npm test` and `npm run build` in the frontend directory to validate in a normal Node environment.
