<!-- Archived from GOALS.md on 2026-09-17: every item under this section was [x]. -->
<!-- Cross-references like §2 elsewhere in GOALS.md point here. -->

## 2. Version control
- [x] Git repository, remote configured (`github.com/alexmiguel011014-stack/Personal_app_android`) —
      the local folder had no `.git` at all until this session (the outer `sites/` monorepo
      deliberately excludes this project via its own `.gitignore`); initialized locally, synced
      onto the existing remote history via `git reset --soft`, dedicated SSH key added, pushed.
- [x] `.gitignore` covers build artifacts, `.idea` noise, `google-services.json`, and (as of this
      session) `android-sdk/`, `graphify-out/`, `repomix-output.xml`.
- [x] No secret committed (`google-services.json` and API keys are correctly gitignored/never
      hardcoded — keys are user-entered at runtime, see §8 for why that itself is a risk).
