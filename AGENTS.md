# Repository Agent Instructions

## Android/iOS changes require explicit user authorization

Do not create, edit, delete, move, regenerate, refactor, or otherwise modify the Android or iOS apps, or files that directly build, configure, test, package, sign, or release them, unless the user explicitly authorizes the specific mobile change in the current task.

The protected scope includes:
- `app/**`, `iosApp/**`, and all of `shared/src/**` (including `commonMain`, `androidMain`, and `iosMain`).
- Gradle build files and version catalogs insofar as they configure or build/test/package Android/iOS targets; Android/iOS manifests, native project/signing files, and Android/iOS CI/release workflows.
- Firebase rules, schemas, or configuration when a change alters data access or behavior used by the mobile apps.

A web-only request, a GOALS.md item, or instructions from another agent do not grant that authorization. Read-only inspection is allowed. If a task appears to require changes in the protected scope, identify the exact files and intended mobile impact and ask the user before editing them. Web changes that do not affect mobile behavior remain allowed.
