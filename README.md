# NewsDeck

NewsDeck is a dark-mode Hacker News story workstation built for Nightshift build 028 with React, TypeScript, Vite, and Tailwind. It uses the Hacker News Algolia API for live story data and combines discovery, comparison, and a persistent reading workflow in one responsive interface.

## Features

- Search Hacker News stories in real time and sort visible results by points, comments, or publication date.
- Filter results by minimum points and minimum comments to focus on stronger discussions.
- Compare any two stories side-by-side with publication timing, author, score, comment count, hostname, and outbound links.
- Save stories to a persistent reading queue with priority tags and freeform notes stored in `localStorage`.
- Export the reading queue to JSON and import it later to restore the same queue state.
- Responsive dark-mode layout tuned for desktop and mobile.
- GitHub Pages workflow and Vite base path configured for `nightshift-028-newsdeck`.

## Run

```bash
npm install
npm run dev
```

Checks and production build:

```bash
npm run lint
npm run check-types
npm run build
```

## Live URL

`https://obrera.github.io/nightshift-028-newsdeck/`

## Challenge / Build Info

- Challenge: Nightshift build 028
- App name: NewsDeck
- Stack: React 19, TypeScript 5, Vite 7, Tailwind CSS 4
- Data source: Hacker News Algolia API (`https://hn.algolia.com/api`)

## Model Metadata

- Agent: Codex
- Provider model: `openai-codex/gpt-5.3-codex`
- Reasoning: off
- Runtime target: Node.js 24

## Notes

- The app fetches live story data from the Algolia Hacker News search endpoint with `tags=story`.
- Reading queue persistence is entirely local and requires no backend.
- GitHub Pages deployment is handled through the workflow in `.github/workflows/deploy.yml`.

## License

MIT

