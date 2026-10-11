# QuickSong — ChatGPT Voice prototype

This is a **separate development branch**, not a live feature. It uses **ChatGPT Voice + a private Site-hosted plugin**, not a separately billed OpenAI API. QuickSong remains the iPhone PWA. The Cloudflare Worker is only a secure mailbox for music-edit instructions; it never stores song contents.

## Architecture

1. On iPhone, start ChatGPT Live Voice and enable **Settings → Voice → Background conversations**.
2. Switch to the QuickSong PWA, open a project. QuickSong must be in the foreground because iOS can pause background PWAs.
3. Say “Using QuickSong, increase the BPM a bit” or “Using QuickSong, add a 5–4–1 in C major.”
4. The personal plugin translates the instruction into a small JSON command and POSTs it to the Cloudflare Worker.
5. QuickSong checks for messages about every 2.5 seconds, validates them, updates the locally stored project, saves it, and acknowledges delivery.
6. A whole command is one Undo action. The project is not sent to ChatGPT or Cloudflare.

## Commands

- `{ "type": "tempo", "operation": "adjust", "value": 5 }`
- `{ "type": "tempo", "operation": "set", "value": 120 }`
- `{ "type": "progression", "tonic": 0, "mode": "major", "degrees": [5,4,1], "instrument": "guitar" }`

Pitch-class numbers: C=0 C#=1 D=2 D#=3 E=4 F=5 F#=6 G=7 G#=8 A=9 A#=10 B=11. Natural minor keys are supported. Diminished chords are not yet supported; the client will reject them without changing the song.

## Cloudflare setup (account owner, once)

Prerequisites: an existing free Cloudflare account and a logged-in Wrangler CLI.

1. Enter the `voice-relay` directory.
2. Run `npx wrangler d1 create quicksong-voice`. Paste the returned `database_id` into `wrangler.toml`.
3. Run `npx wrangler d1 execute quicksong-voice --remote --file=./schema.sql`.
4. Generate a random 32-byte secret, such as `openssl rand -hex 32`. Save it in a password manager.
5. Run `npx wrangler secret put VOICE_TOKEN` and supply that value interactively.
6. Run `npx wrangler deploy`. Copy the deployed HTTPS `*.workers.dev` URL.
7. On the iPhone QuickSong project, tap **Voice** and enter the Worker URL and the same secret.
8. For initial testing, POST a command directly using an HTTP client and verify QuickSong updates. Keep the secret out of URLs and source code.

Cloudflare Workers and D1 have free tiers; actual eligibility and usage limits depend on your Cloudflare account. This prototype does not include a production-grade multi-user authentication system. Never publish your secret.

## ChatGPT Site/plugin creation prompt

Open ChatGPT **Work → Sites** and use the text below. **Do not put the private token into the chat transcript or a source file.** Configure it through the Site's protected secret settings.

> Create a **private** QuickSong Voice Bridge Site with an MCP server and a personal ChatGPT plugin. Its purpose is to turn spoken commands into the JSON schema below and send them to my existing authenticated Cloudflare Worker.
>
> Use two protected server-side secrets: QUICKSONG_VOICE_URL (my Worker HTTPS origin) and QUICKSONG_VOICE_TOKEN (my 32+ character bearer credential). The secrets must never be sent to the browser, exposed in tool descriptions, logs, output, source control, or query strings.
>
> Implement three plugin tools:
> - `set_tempo(bpm: integer)`: POST `{"command":{"type":"tempo","operation":"set","value":bpm}}`
> - `adjust_tempo(delta_bpm: integer)`: POST `{"command":{"type":"tempo","operation":"adjust","value":delta_bpm}}`
> - `add_progression(tonic: integer 0..11, mode: "major"|"minor", degrees: array of 1..7, instrument:"guitar"|"piano")`: POST `{"command":{"type":"progression","tonic":tonic,"mode":mode,"degrees":degrees,"instrument":instrument}}`
>
> Send POST requests to QUICKSONG_VOICE_URL + `/v1/commands`, with `Authorization: Bearer <the secret>` and `Content-Type: application/json`. Validate parameters before sending. If the Worker returns an error, report it; otherwise tell me the instruction was queued, **not that it was applied**. Do not expose the token to the model or user-facing responses.
>
> For vague tempo adjustments such as “a bit faster” use +5 BPM; “a bit slower” use -5 BPM, unless context specifies another change. For “5 4 1 in C major”, use tonic=0, mode=major, degrees=[5,4,1]. Unless specified, choose guitar chords. Keep actions confined to these three tools. Do not create unrelated integrations.
>
> Test in a text chat first. Then ask me to publish the Site, install the generated private plugin, and test the same command in ChatGPT Live Voice on iPhone. Report honestly if outbound HTTPS requests or secret storage are unavailable.

Once the Site is published, install its private plugin through the plugin card or **Plugins → Personal → Created by you**.

## Limitations / verification

- The **personal Site plugin** still must be created, published and installed by the user in their ChatGPT account; this repository cannot do that.
- ChatGPT Voice documentation says Live supports plugins, but **this specific Site-hosted plugin must be tested in Live**. Do not assume the end-to-end chain works before testing.
- QuickSong must be open on the project in the foreground while ChatGPT runs in the background. iOS may suspend QuickSong if it is backgrounded or locked.
- The connection requires internet, Cloudflare deployment and a secret. There is no ChatGPT API billing and no Apple Developer membership.
- The command queue retains acknowledged messages until a separate cleanup is configured; the current prototype should be used privately.
