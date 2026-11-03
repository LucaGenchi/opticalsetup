# OpticalSetup MCP

This optional Node service exposes the existing OpticalSetup component registry,
scene editing, and ray tracer to MCP clients. The ChatGPT widget uses the same
browser editor. It keeps its setup and undo history in browser storage. Tools
process the scene supplied with each request and return a new snapshot. The
service has no scene database or accounts.

## Run locally

With Node.js 22 or later, run `node mcp/server.js`. The server binds to
`127.0.0.1:5188` by default. Its MCP endpoint is
`http://127.0.0.1:5188/mcp`, the browser preview is at `/mcp/workbench`,
and `/mcp/health` reports readiness. Run the MCP tests with
`node --test test/mcp/*.test.js`. No npm installation or widget build is
needed to start the service.

The PNG screenshot tool needs Linux with a tmpfs at `/dev/shm` and FFmpeg
with SVG input support. The other tools and workbench can run without it.
Inspection uses OpticalSetup's existing 2D ray model and detector limits.
Manual beams remain diagram-only.

## Hosting

Set `PUBLIC_ORIGIN` to the public HTTPS origin, without a trailing slash or
path, and optionally set `PORT` for the loopback listener. Have the proxy
preserve the public Host header, forward `/mcp` and `/mcp/*`, and disable
response buffering for `/mcp/events` so the widget receives edits as they
arrive. If the host asks for domain verification, set
`OPENAI_APPS_CHALLENGE` in the service environment and also route
`/.well-known/openai-apps-challenge` to it.

GitHub Pages serves static files. A URL such as
`https://opticalsetup.com/mcp` would require a separate service behind a
proxy on that domain. An OpticalSetup subdomain could host the same service.
Use the chosen HTTPS URL when connecting the plugin in ChatGPT developer mode.
See the [OpenAI MCP server guide](https://developers.openai.com/plugins/build/mcp-server)
and [widget guide](https://developers.openai.com/plugins/build/chatgpt-ui).
