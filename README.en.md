# Party Night

[Simplified Chinese](./README.md) | English

A zero-account, offline-capable mobile party-game PWA for starting games quickly at bars, house parties, and icebreakers.

![Party Night](./public/brand/party-night-logo.svg)

## What it does

- Configure two or more players, relationships, vibes, intensity, and content boundaries before starting a full game.
- Play Truth or Dare, Most Likely To, Never Have I Ever, and AI Improv either separately or in mixed mode.
- Prepare the entire deck before play. Once saved, the current session can continue, swap cards, skip, refresh, and recover without a network connection.
- Start entirely from local seed cards, or configure DeepSeek Official, OpenCode Go, or a custom OpenAI-compatible provider.
- Create, edit, enable, disable, and delete custom game packs stored only on the current device.
- Adjust intensity, pause or resume, add or temporarily deactivate players, and view a lightweight end-of-game summary.

## Quick start

Requires Node.js 24.x and pnpm 11.x.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and select **Tonight's Game**. AI configuration is optional: choose the local seed-deck action on the generation screen to play without a provider.

## AI providers and API keys

Open **AI Model Settings** from the home screen:

1. DeepSeek Official (`https://api.deepseek.com` / `deepseek-flash`) is selected by default.
2. Enter an API key and choose whether to persist it locally with Web Crypto encryption. If persistence is unchecked, the key lasts only for the current browser session.
3. You can test the connection before saving the configuration.
4. OpenCode Go is experimental and must be selected manually. It is never the default or an automatic fallback. Its official endpoint primarily targets OpenCode and similar coding agents, so compatibility may change.
5. Custom OpenAI-compatible providers must use a public HTTPS endpoint. The server rejects localhost outside development, private, link-local, metadata, DNS-resolved non-public addresses, and redirects.

To remove a key, use the separate red Danger Zone at the bottom of the settings page. The first click only opens a confirmation dialog. Cancel keeps the key; deletion occurs only after selecting the red **Confirm clear** action.

### Development-only environment fallback

Normal users do not need an `.env` file. For local integration work, copy the provided sample:

```bash
cp .env.example .env.local
```

```dotenv
PARTY_NIGHT_ENABLE_ENV_AI_FALLBACK=false
PARTY_NIGHT_DEV_AI_API_KEY=
```

The sample defaults to off; change `false` to `true` for local integration work. This fallback is used only outside production, only when explicitly enabled, and only when the request does not carry a user key. Never commit `.env.local` or a real key, and never expose a secret through a `NEXT_PUBLIC_` variable.

## Data and security

- Player preferences, game packs, sessions, deck snapshots, and summaries remain in the current browser's `party-night-v1` IndexedDB database. They are not uploaded to a cloud database.
- Persisted API keys use AES-GCM encryption. IndexedDB stores only ciphertext, a random IV, and a non-extractable `CryptoKey`. If secure persistence is unavailable, the app falls back to session-only storage instead of writing plaintext.
- A key is sent temporarily to the same-origin proxy only during a connection test or deck generation. It is not placed in URLs, sessions, ordinary preferences, logs, or server-side persistent storage.
- The Service Worker excludes `/api/` requests, so AI traffic never enters Cache Storage.

### Backup and deletion

V1 does not include built-in data export or import. To retain local data, back up the corresponding browser profile and avoid clearing storage for the site. Clearing site data removes preferences, custom packs, sessions, and encrypted key records. To remove only an API key, use the AI settings Danger Zone.

## PWA installation and offline use

Production deployments should use HTTPS; localhost is the development exception. Install Party Night with the browser's **Add to Home Screen** or **Install app** action. After a page has been visited online and a deck has been prepared, the cached current session can reload and continue locally while fully offline.

## Production build and Docker

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm start
```

The Docker image does not need to contain a personal API key:

```bash
docker build -t party-night .
docker run --rm -p 3000:3000 party-night
```

Deploy only on a trusted machine, and provide HTTPS through a reverse proxy or private-network ingress.

## Technical notes

- Next.js 16.3.3, React 19, TypeScript 5, Tailwind CSS 4, and CSS design tokens
- Zod validation for AI output, sessions, and local data
- IndexedDB through `idb`, with Web Crypto for local secret encryption
- Vitest, Testing Library, and Playwright

The Party Game Engine is decoupled from game packs. The engine owns players, card selection, intensity, boundaries, rounds, and persistence, while each pack provides only its definition and cards.

## V1 scope

Party Night V1 is a single-device, local-first application. It does not provide accounts, payments, a cloud database, a public community, or real-time multiplayer rooms.

