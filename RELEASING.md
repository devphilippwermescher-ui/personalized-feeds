# Release process

The repository promotes changes through three environments:

```text
pull request -> development -> merge to main -> staging -> version increase on main -> production
```

## Development

Every push to a pull request targeting `main` runs both CI workflows. After validation succeeds:

- the extension build is available as a downloadable GitHub Actions artifact;
- the dashboard is deployed to a Firebase Hosting preview channel named `pr-<number>`;
- Firebase posts or updates the preview URL on the pull request.

Each pull request has its own preview channel. A new push updates the same channel and cancels an obsolete in-progress deployment. Pull requests from forks run CI but do not receive Firebase credentials or a preview deployment.

Development builds do not create Git tags or GitHub Releases.

The build is labeled `myFeedPilot Dev` in Chrome. After a merge to `main`, the latest development ZIP is also
published to the team release hub at `https://myfeedpilot-team.web.app`.

## Staging

Every push to `main` (normally a merged pull request) creates staging output after CI succeeds:

- GitHub creates a pre-release named `Staging <short-sha> (v<version>)`;
- the staging extension ZIP is attached to the pre-release;
- the latest development and staging ZIPs are published to the team release hub;
- the dashboard is deployed to the staging project's live Hosting channel at
  `https://myfeedpilot-staging.web.app`.

Protect `main` against direct pushes so that one merge corresponds to one staging release.

## Production

After the staging build has been tested, create a release-only pull request that increases the product version:

```bash
npm run version:set -- 0.2.0
```

Commit all files changed by that command and merge the pull request into `main`. The merge creates the normal staging pre-release and, because the version increased, also:

- creates the immutable `v0.2.0` production tag and GitHub release;
- attaches the production extension ZIP;
- attaches a stable `myfeedpilot-latest.zip` download alias;
- updates the public product page at `https://myfeedpilot-production.web.app`;
- deploys the same dashboard build to the Firebase Hosting live channel.

Versions use `X.Y.Z` semantic versioning. Never reuse or delete a production tag; publish the next patch version instead.

## GitHub configuration

Create GitHub environments named `development`, `staging`, and `production`. Configure these values inside each environment:

- secret `FIREBASE_SERVICE_ACCOUNT` with that environment's Firebase service-account JSON;
- variable `FIREBASE_PROJECT_ID` with that environment's Firebase project ID.

The expected project IDs are:

- `development`: `myfeedpilot-dev`;
- `staging`: `myfeedpilot-staging`;
- `production`: `myfeedpilot-production` (deployed to the `myfeedpilot-app` Hosting site).

Firebase Hosting deploy targets are declared in `.firebaserc`. The production
target deliberately points to `myfeedpilot-app`, so its public URL is
`https://myfeedpilot-app.web.app` rather than the project's default Hosting URL.

The production Firebase project also hosts two independent static sites:

- `myfeedpilot-production` at `https://myfeedpilot-production.web.app` for the public product page;
- `myfeedpilot-team` at `https://myfeedpilot-team.web.app` for development, staging, and production downloads.

The team hub is excluded from search indexing, but it is still publicly reachable by anyone who knows its URL.

Use a development-only Firebase project and minimally privileged service account for the `development` environment because its credential is available to same-repository pull-request workflows. Pull requests from forks are deliberately prevented from deploying. Do not configure a required reviewer if previews and production releases must remain fully automatic.

Separate Firebase projects for development, staging, and production provide proper Firestore and Authentication isolation. As a temporary setup, all three environments can point to the existing project, but previews will then use production backend data.

The extension currently allows external dashboard communication from the production Hosting origin and localhost. Do not broaden that permission to every `web.app` site. If a development or staging dashboard must communicate with the extension, give it a stable dedicated Firebase Hosting domain and add only that exact origin to the extension manifest.
