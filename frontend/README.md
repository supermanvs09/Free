# Deep Algorithms NHI Console

Non-human identity security across AWS, Azure, GitHub, Bitbucket and HashiCorp Vault,
with Jira issues and email notifications. React 19 + Vite + Tailwind v4.

The console needs no backend or database. The estate it shows is built in the browser
(`src/data/world.js`), and everything people change (Jira issues, comments, assignments,
remediation runs, connections, automations, mail) is stored in the shared document store
of the published page (`src/data/store.js`, `src/data/realtime.js`), so every viewer of
the same link sees each other's changes live. Run anywhere else, it falls back to
browser storage that syncs between tabs.

```sh
npm install
npm run dev      # http://localhost:3000
npm run build    # dist/index.html: one self-contained file
```

`npm run build` also writes `dist/console.html`, the same page without the
`<html>/<head>/<body>` skeleton, which is the form that is published.
