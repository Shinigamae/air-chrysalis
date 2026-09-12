#!/usr/bin/env node
/**
 * spotify-auth — the one-time browser consent that `npm run music:sync` needs.
 *
 *   npm run music:auth
 *
 * Run once, ever. It opens Spotify's consent screen, catches the redirect on
 * a throwaway local server, trades the code for a refresh token, and prints
 * it. The refresh token does not expire; from then on the sync is unattended.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all, when the other syncs just fetch a public feed:
 *
 * "Most played" is not public. Nobody's play counts are — not even from their
 * own public playlists, which is what makes a curated playlist a different
 * (and less honest) thing than this. /me/top/tracks is the only endpoint that
 * knows, and it will only answer for a user who has said so in a browser.
 *
 * Deliberately NOT the PKCE flow, which would avoid needing the client
 * secret. Spotify rotates the refresh token on every PKCE refresh, so the
 * stored credential would go stale and the GitHub Actions secret would need
 * replacing every time the sync ran. The classic code flow hands back one
 * long-lived refresh token, which is what an unattended sync wants.
 * ---------------------------------------------------------------------------
 *
 * First, create the app — once, at https://developer.spotify.com/dashboard:
 *
 *   1. Create app. Name and description can be anything.
 *   2. Redirect URI: exactly  http://127.0.0.1:8888/callback
 *      Spotify no longer accepts `localhost` here — it must be the loopback
 *      IP literal, and the port must match PORT below.
 *   3. API: tick "Web API".
 *   4. From Settings, copy the Client ID and the Client secret into .env:
 *
 *        SPOTIFY_CLIENT_ID=...
 *        SPOTIFY_CLIENT_SECRET=...
 *
 * Then run this. It prints SPOTIFY_REFRESH_TOKEN=... to add to the same file.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Must match the redirect URI registered on the app, exactly. */
const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

/**
 * The least Spotify will accept for the two things this site shows. Not
 * `user-read-email`, not `user-read-private`, not anything about playlists —
 * a sync that only needs to read a chart should not hold a token that can do
 * more than read that chart.
 */
const SCOPES = 'user-top-read user-read-recently-played';

function credentials() {
  if (!process.env.SPOTIFY_CLIENT_ID) {
    try {
      process.loadEnvFile(path.join(ROOT, '.env'));
    } catch {
      /* no .env — fall through to the error below */
    }
  }
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      [
        'Missing Spotify app credentials.',
        '',
        '  Create an app at https://developer.spotify.com/dashboard, set its',
        `  redirect URI to exactly ${REDIRECT_URI}, then put`,
        '',
        '    SPOTIFY_CLIENT_ID=...',
        '    SPOTIFY_CLIENT_SECRET=...',
        '',
        '  in .env (already gitignored), or in the environment.',
      ].join('\n'),
    );
  }
  return { id, secret };
}

/** Best-effort — printing the URL is the real interface; this is a courtesy. */
function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* the user can paste it */
  }
}

const page = (title, detail) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  '<body style="background:#09090b;color:#e4e4e7;font:14px ui-monospace,monospace;' +
  'display:grid;place-items:center;height:100vh;margin:0">' +
  `<div style="text-align:center"><p style="color:#38bdf8">${title}</p><p>${detail}</p></div>`;

async function main() {
  const { id, secret } = credentials();
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl =
    'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      client_id: id,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state,
      // Always show the consent screen. Without it a second run silently
      // reuses the previous grant, which hides a scope that was never given.
      show_dialog: 'true',
    });

  /** Resolves with the authorization code once Spotify redirects back. */
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const returned = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const value = url.searchParams.get('code');

      // The state check is the point of the state: without it, anything that
      // can reach this port could hand the script a code of its choosing.
      if (error || returned !== state || !value) {
        res.writeHead(400, { 'content-type': 'text/html' });
        res.end(page('REFUSED', error ?? 'state mismatch'));
        server.close();
        reject(new Error(error ?? 'state did not match — start again'));
        return;
      }

      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(page('AUTHORISED', 'You can close this tab and go back to the terminal.'));
      server.close();
      resolve(value);
    });

    server.on('error', (cause) =>
      reject(
        new Error(
          `Could not listen on ${PORT} (${cause.code}). Close whatever is using it, ` +
            'or change PORT here and in the app’s redirect URI — they must match.',
        ),
      ),
    );

    server.listen(PORT, '127.0.0.1', () => {
      console.log(`Waiting on ${REDIRECT_URI}\n\nIf a browser did not open:\n\n  ${authUrl}\n`);
      openBrowser(authUrl);
    });
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const body = await response.json();
  if (!response.ok || !body.refresh_token) {
    throw new Error(
      `Token exchange failed (${response.status}): ${body.error_description ?? body.error ?? 'no refresh token returned'}`,
    );
  }

  console.log(
    [
      '',
      'Done. Add this line to .env:',
      '',
      `  SPOTIFY_REFRESH_TOKEN=${body.refresh_token}`,
      '',
      'And add the same value as a repository secret named SPOTIFY_REFRESH_TOKEN,',
      'alongside SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET, so the daily',
      'content-sync workflow can run it unattended.',
      '',
      'It does not expire. Keep it out of the repository — it reads your',
      'listening history.',
      '',
    ].join('\n'),
  );
}

try {
  await main();
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exitCode = 1;
}
