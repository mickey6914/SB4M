# Your first run

A walkthrough of the app end to end, with the point of no return marked clearly.
Everything before that point is free and reversible — you can poke at it as much
as you like. Read to the end of "The safe stopping point" before you start and
you can't get into trouble.

## Part 1 — Getting it online (one time, ~15 minutes)

This app has no website yet. Putting it on one is a one-time setup done
entirely in a web browser — no terminal, no installing anything. At the end you
get a normal web address you can open from a laptop or a phone.

Everything the host needs is already in this repository: a `Dockerfile` that
builds the app, and a `render.yaml` that tells the host what to ask you for.

### What you'll need open

Four API keys, copied somewhere you can paste from:

| Key | What it turns on | Where it comes from |
| --- | --- | --- |
| `ABACUS_API_KEY` | Scene backgrounds | abacus.ai → your profile → API keys |
| `PIN_POST_ANTHROPIC_KEY` | AI copywriting | console.anthropic.com → API keys |
| `CONTENT360_API_KEY` | Pushing posts out | your Content360 workspace settings |
| `APP_PASSWORD` | The password for the app itself | you invent it, or let the host generate one |

### The steps

1. Go to **render.com** and sign in with GitHub.
2. **New → Blueprint**, and pick the `mickey6914/SB4M` repository.
3. Render finds `render.yaml` and shows a form asking for the keys above. Paste
   each one in. `APP_PASSWORD` can be generated for you — **save it somewhere**,
   it's how you'll get in.
4. **Apply**. The first build takes a few minutes; it's compiling the app.
5. When it finishes, Render shows a URL like
   `https://pin-post-studio.onrender.com`. That's your app.

Open it. Your browser will ask for a username and password — **any username
works**, the password is `APP_PASSWORD`.

### Why there's a password

The app can spend your Anthropic and Abacus credits and post to your real
Pinterest, Facebook and Instagram accounts. A public address with no password
means anyone who finds it can do those things. So the app **refuses to start**
without `APP_PASSWORD` — that's deliberate, and if the host shows a startup
error saying so, that's the reason.

### If the build fails

Render's Logs tab shows why in plain language. The most common cause is a
missing key. Fix it under Environment and redeploy.

## Part 2 — Your first run

From here on you're in the app itself, in your browser. Nothing below needs a
terminal.

## Step 0 — Connections

Go to **Connections** in the sidebar first. It's the settings screen, and two
things there matter before a run.

**Scene backgrounds** should read *Abacus (RouteLLM)*. If it says "Setting not
recognised", `SCENE_PROVIDER` has a typo — backgrounds are deliberately stopped
rather than quietly rendered by some other provider. If it says "Built-in
backdrops (no key yet)", the app can't see `ABACUS_API_KEY`.

**Pick a Pinterest board.** Pinterest won't publish a pin without one. You can
run the whole app without it, and Review will warn you, but the push will just
sit there holding the posts.

While you're here: if a network has more than one connected account, choose
which one receives the posts. Instagram has two, and the right one for Express
Art Vibe is `dealsandstealsforreal`.

## Step 1 — Where's the product?

**New run** in the sidebar. Paste a product listing URL.

Use a **single product page**, not a category or collection page. See "Known
rough edges" below — this one will bite you if you're not expecting it.

Etsy and Amazon block server-side fetching, so a link from either may fail to
load. That's a known limitation, not something you've done wrong. If it does,
use the upload fallback on the same screen and pick photos from your computer —
the rest of the run works identically.

## Step 2 — Pick the hero image

The listing's images appear; choose the one that leads. Nothing destructive
here, and you can go back.

## Step 3 — How many pins?

Three choices:

| Option | Pins | Takes |
| --- | --- | --- |
| **Quick test** | 3 | ~20 seconds |
| One week | 7 | ~40 seconds |
| One month | 30 | ~1m 50s |

**Pick "Quick test" for your first run.** It exercises the identical pipeline in
a fifth of the time, and if something looks wrong you've spent 20 seconds
finding out.

Same screen: a free-text style direction ("warm fall colours, no people"), which
networks to fan out to, and which crops to render. Leave the defaults if you're
not sure — Pinterest-only is the gentlest first run.

## Step 4 — Choose three scenes

Three backgrounds get generated per run and reused across its pins, which is why
a run costs pennies rather than pounds. **Surprise me** picks three at random if
you'd rather not decide.

## Step 5 — Progress

The run happens: copy is written, backgrounds are generated, your product photo
is composited onto each one, and every crop is rendered. A minute or two at
most. Your product photograph is never sent to an image model — the model draws
an empty room, and your real photo is placed on top afterwards, so it cannot be
altered or redrawn.

## Step 6 — Review

This is the screen worth your attention, and **it is still completely safe.**
Nothing has left your computer except the AI calls.

Each pin has an inspector where you can:

- edit the title, description and overlay text by hand
- **Rewrite with AI** if the copy isn't right
- **Approve pin** or **Reject**

**Approve all** accepts the batch in one click. The counter at the top tracks
approved and flagged.

Take your time here. This is where you find out whether the product is any good
— whether the copy sounds like you, whether the mockups look like something
you'd publish.

## The safe stopping point

**Everything above is free and reversible. Stop here and nothing has happened.**

The next button is **Push to Content360**, and it is real. It creates real posts
on your real accounts, scheduled at real times, and Content360 will publish
them. It stays disabled until at least one pin is approved, which is the only
thing standing between you and a live post.

If you just want to see what the app produces — stop here. You've seen all of
it. The push adds no new information about whether the pins are good.

When you *do* push, know that:

- It's one post per request, so a big batch takes a few minutes of real time
  and shows progress rather than a spinner.
- Posts land on the schedule the calendar shows — the 09:00–17:00 window, the
  per-network stagger, the daily caps set in Connections.
- A partial failure is genuinely partial. One rejected post doesn't sink the
  others, and **Retry failed** on the Dashboard picks up the stragglers.
- To undo it you delete the posts in Content360 before their publish time.

## Known rough edges

Honest list of what will look broken, as of this writing:

- **A collection or category URL is treated as a product.** Paste one and the
  reader finds no product, falls back to the page's own metadata, and cheerfully
  returns the shop's name and logo — which becomes thirty pins of a logo. Use a
  single product page until this is fixed.
- **Etsy and Amazon block server-side fetching.** Use the upload fallback.
- **Six posts scheduled for November 2027** sit in the Content360 workspace from
  an earlier testing session. They're harmless and deliberately left alone —
  deleting a seller's posts isn't the app's call — but that's what they are if
  you spot them.

## If something goes wrong

Most failures explain themselves in the screen where they happen, by design —
a missing key says which key, a refused push says which post and why.

| What you see | What it means |
| --- | --- |
| Browser keeps asking for the password | Wrong password. Check `APP_PASSWORD` in the host's Environment tab. |
| "Setting not recognised" on Connections | `SCENE_PROVIDER` is misspelt. It should be `abacus`. |
| "Built-in backdrops (no key yet)" | The host can't see `ABACUS_API_KEY`. |
| The app won't start at all | Almost always a missing `APP_PASSWORD`. The host's Logs tab says so in a sentence. |
| A run is slow to start after idle time | If you chose the free plan, the service sleeps and takes ~30s to wake. |

Changing any key means editing it in the host's Environment tab and
redeploying — never in a file.

And the reasoning behind every product decision — why the hybrid image
approach, how the Content360 API really works, what the Abacus verification
found — is recorded in [`DECISIONS.md`](DECISIONS.md).
