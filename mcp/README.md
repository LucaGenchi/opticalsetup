# OpticalSetup MCP

This optional Node service exposes the existing OpticalSetup component registry,
scene editing, and ray tracer to MCP clients. Hosts that show
[MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) (ChatGPT,
Claude) also get the workbench as a view inside the chat; it is the same browser
editor. The view keeps its setup and undo history in browser storage. Tools
process the scene supplied with each request and return a new snapshot. The
service has no scene database or accounts.

## Run locally

With Node.js 22 or later, run `node mcp/server.js`. The server binds to
`127.0.0.1:5188` by default. Its MCP endpoint is
`http://127.0.0.1:5188/mcp` (`localhost` works too), the browser preview is at
`/mcp/workbench`, and `/mcp/health` reports readiness. Run the MCP tests with
`node --test test/mcp/*.test.js`. No npm installation or widget build is
needed to start the service.

The PNG screenshot tool needs Linux with a tmpfs at `/dev/shm` and FFmpeg
with SVG input support. Where either is missing (macOS, for one) the service
does not list the tool and does not ask the model to verify edits with it;
`/mcp/health` reports `screenshots`. The other tools and the workbench run
without it. Inspection uses OpticalSetup's existing 2D ray model and detector
limits. Manual beams remain diagram-only.

## Hosting

Set `PUBLIC_ORIGIN` to the public HTTPS origin, without a trailing slash or
path, and optionally set `PORT` for the loopback listener. Have the proxy
preserve the public Host header, forward `/mcp` and `/mcp/*`, and disable
response buffering for `/mcp/events` so the view receives edits as they
arrive. The service has no sign-in and each inspection starts a process, so
put a request rate limit in front of it.

GitHub Pages serves static files. A URL such as
`https://opticalsetup.com/mcp` would require a separate service behind a
proxy on that domain. An OpticalSetup subdomain could host the same service.

## Use with ChatGPT

Use the chosen HTTPS URL when connecting the plugin in ChatGPT developer mode.
If the host asks for domain verification, set `OPENAI_APPS_CHALLENGE` in the
service environment and also route `/.well-known/openai-apps-challenge` to it.
The view's dedicated origin is sent as `openai/widgetDomain`. See the
[OpenAI MCP server guide](https://developers.openai.com/plugins/build/mcp-server)
and [widget guide](https://developers.openai.com/plugins/build/chatgpt-ui).

## Use with Claude

Not yet run in Claude itself; this follows Anthropic's connector
documentation and is checked here against a simulated host.

- **Claude Code** talks to the local service directly and uses the tools as
  text (it shows no view):
  `claude mcp add --transport http opticalsetup http://127.0.0.1:5188/mcp`.
- **claude.ai, Claude Desktop and the mobile apps** reach a connector from
  Anthropic's servers, so the service needs a public HTTPS URL: the hosted
  one, or a tunnel to a local one with `PUBLIC_ORIGIN` set to the tunnel's
  origin. Add it under **Customize > Connectors > Add custom connector** with
  "No sign in". See
  [Test your connector](https://claude.com/docs/connectors/building/testing).

Claude names a view's sandbox origin itself, from a hash of the connector URL,
and refuses to show a view that declares any other `ui.domain`. The service
therefore declares none, and accepts the live channel from
`https://<hash>.claudemcpcontent.com`.

Limits to keep in mind: a tool takes the whole scene and returns it, so a
result grows with the scene. The bundled 120-component community setup
returns about 100,000 characters per edit. Claude Code cuts tool results at
25,000 tokens unless `MAX_MCP_OUTPUT_TOKENS` is raised, which a scene of
that size exceeds, and claude.ai stops passing results to the view above
about 150,000 characters.
