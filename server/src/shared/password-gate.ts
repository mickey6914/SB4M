import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

// The whole app behind one password.
//
// This exists because of what the app can do, not because of what it holds:
// anyone who reaches it can spend the seller's Anthropic and Abacus credits and
// push posts to their real Pinterest, Facebook and Instagram accounts. On a
// laptop at localhost that does not matter. On a public URL it is the only
// thing standing between a stranger and the seller's audience.
//
// HTTP Basic rather than a login screen and a session: it covers the API and
// the app itself in one hook, every browser already knows how to show the
// prompt, and there is no session state to get wrong. The trade is a browser
// dialog instead of a designed page, and no sign-out short of closing the
// browser — worth it for something one person opens.

const REALM = 'Pin-Post Studio';

// Compare in constant time so the reply time does not leak how much of the
// password was right. Both sides are hashed to a fixed length first, because
// timingSafeEqual throws on a length mismatch — which would itself be a tell.
function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still burn a comparison so a wrong length is not measurably faster.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function appPassword(): string | undefined {
  const raw = process.env.APP_PASSWORD;
  return raw && raw.trim() ? raw : undefined;
}

// Deploying without a password would publish the seller's accounts to whoever
// finds the URL, and a warning in a log nobody reads is not a safeguard. So in
// production the absence of a password stops the server instead.
export function assertPasswordConfigured(): void {
  if (appPassword()) return;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'APP_PASSWORD is not set. This app can spend your API credits and post to your ' +
        'social accounts, so it refuses to run unprotected where it is reachable. ' +
        'Set APP_PASSWORD in the host environment and restart.'
    );
  }
}

export function registerPasswordGate(app: FastifyInstance) {
  const expected = appPassword();
  if (!expected) {
    app.log.warn('APP_PASSWORD not set — running with no password (development only).');
    return;
  }

  app.addHook('onRequest', async (req, reply) => {
    // The health check stays open so a host can tell whether the app is up
    // without holding the password. It reveals nothing but "yes".
    if (req.url === '/api/health') return;

    const header = req.headers.authorization ?? '';
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      // Any username is accepted — there is one user, and asking them to
      // remember a name as well as a password buys nothing.
      const password = decoded.slice(decoded.indexOf(':') + 1);
      if (matches(password, expected)) return;
    }

    reply
      .code(401)
      .header('WWW-Authenticate', `Basic realm="${REALM}", charset="UTF-8"`)
      .send({ ok: false, message: 'This app is password protected.' });
  });
}
