# Markdown to Jira Wiki

A zero-backend static web page that converts common Markdown into Jira/Confluence wiki markup in the browser.

## Compatibility

The output targets **Jira Data Center** comments and text fields configured with the **Wiki Style Renderer**. Jira Cloud comments use Atlassian Document Format (ADF); this converter does not produce ADF.

## User flow

1. Paste Markdown, type it, or drop a `.md` file.
2. The Jira wiki output updates immediately.
3. Select **Copy Jira wiki** or press `Ctrl/Command + Enter`.

No content is uploaded or persisted. The page makes no network requests.

## Run locally

Open `index.html` directly, or serve the directory:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Static deployment

Upload the directory to any HTTPS static host, including Vercel, GitHub Pages, Netlify, Cloudflare Pages, or Amazon S3 with CloudFront. There is no build step.

The included `vercel.json` and `_headers` files apply a restrictive Content Security Policy while allowing the page to be framed. Do not add `X-Frame-Options: DENY` or a `frame-ancestors` policy that excludes your Confluence origin.

## Embed in Confluence

Host the files over HTTPS. Add Confluence's **iFrame** macro and use:

```text
https://your-static-host.example/index.html?embed=1
```

Suggested settings:

- Width: full width or at least 900 pixels
- Height: 700–850 pixels
- Scrolling: auto

On Confluence Data Center, the equivalent is the **HTML Include** macro or an
`<iframe>` inside the **HTML** macro. Those legacy macros are commonly disabled
by administrators because enabling arbitrary HTML increases cross-site
scripting risk. Confirm the approved macro with the Confluence administrator.

The compact mode also accepts:

```text
?embed=1&theme=light&autofocus=0
```

Possible values for `theme` are `light` and `dark`.

Add `events=1` only when the parent page needs live `md2jira:changed`
messages. It is disabled by default so text typed into the converter is not
automatically disclosed to the embedding page.

For a normal web page, the equivalent HTML is:

```html
<iframe
  src="https://your-static-host.example/index.html?embed=1"
  title="Markdown to Jira wiki converter"
  width="100%"
  height="760"
  loading="lazy"
  allow="clipboard-read; clipboard-write"
></iframe>
```

Some hosts or parent pages restrict clipboard access in cross-origin iframes. The converter falls back to selecting the output so the user can press `Ctrl/Command + C`.

The supplied hosting headers allow framing from any HTTPS site. For an
internal-only deployment, replace `frame-ancestors *` with an allowlist of the
approved Confluence and application origins.

## Programmatic iframe API

Use `window.postMessage()` when the parent page needs to submit Markdown and receive the result across origins.

```html
<iframe id="md2jira" src="https://your-static-host.example/index.html?embed=1"></iframe>
<script>
  const frame = document.getElementById("md2jira");

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message?.protocol !== "md2jira/v1") return;

    if (message.type === "md2jira:ready") {
      frame.contentWindow.postMessage({
        protocol: "md2jira/v1",
        type: "md2jira:convert",
        requestId: "request-1",
        markdown: "# Build result\n\n**Status:** Passed"
      }, "https://your-static-host.example");
    }

    if (message.type === "md2jira:result") {
      console.log(message.requestId, message.jiraWiki);
    }
  });
</script>
```

Messages:

- Parent to iframe: `md2jira:convert` or `md2jira:set`
- Iframe to parent: `md2jira:ready`, `md2jira:result`, and `md2jira:resize`
- Optional with `events=1`: `md2jira:changed`
- Protocol identifier: `md2jira/v1`

See `embed-example.html` for a working parent-form integration.

## Conversion coverage

- ATX and Setext headings
- Bold, italic, bold+italic, and strikethrough
- Inline code and fenced code blocks with common language aliases
- Ordered, unordered, nested, mixed, and task lists
- GitHub-style tables
- Block quotes and horizontal rules
- Inline links, reference links, autolinks, and remote images
- Markdown hard breaks and indented code blocks

The converter intentionally targets common engineering Markdown rather than implementing every CommonMark edge case.

## Test

Node.js 20 or newer is sufficient. There are no test dependencies.

```bash
npm test
```

To run the optional regression check against a local Markdown file:

```bash
MD2JIRA_FIXTURE=/path/to/document.md npm test
```

## Files

- `index.html` — main page and iframe UI
- `converter.js` — dependency-free conversion engine
- `app.js` — browser UX and `postMessage` API
- `styles.css` — responsive light/dark styling
- `embed-example.html` / `embed-example.js` — host-page integration example
- `vercel.json` / `_headers` — static-host security headers
- `tests/converter.test.js` — Node built-in test suite
