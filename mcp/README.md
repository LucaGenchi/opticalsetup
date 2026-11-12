# OpticalSetup MCP

This optional Node service exposes the existing OpticalSetup component registry,
scene editing, and ray tracer to MCP clients. Hosts that show
[MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) (ChatGPT,
Claude) also get the workbench as a view inside the chat; it is the same browser
editor. The view owns the setup and undo history in browser storage. It
registers the current scene with an in-memory mirror and sends incremental
updates as it edits. The service has no scene database or accounts.

## Run locally

With Node.js 22 or later, run `node mcp/server.js`. The server binds to
`127.0.0.1:5188` by default. Its MCP endpoint is
`http://127.0.0.1:5188/mcp` (`localhost` works too), the browser preview is at
`/mcp/workbench`, and `/mcp/health` reports readiness. Run the MCP tests with
`node --test test/mcp/*.test.js`. No npm installation or widget build is
needed to start the service.

A client that starts its MCP servers itself can run the service with
`node mcp/server.js --stdio`. It then speaks MCP on its standard input and
output and logs to standard error. The loopback listener still runs, because
the view loads its files and its live channel from it. If port 5188 is taken,
a service started this way takes a free port instead; set `PORT` to insist on
one.

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
arrive. Route the MCP calls, event stream, and sync requests for a
workbench to the same Node process. The service has no sign-in and each
inspection starts a process, so put a request rate limit in front of it.

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

- **Claude Desktop, on your own machine**, starts the service itself. Open
  **Settings > Developer > Edit Config** and add it to
  `claude_desktop_config.json`, with the path to this repository, then
  restart Claude Desktop:

  ```json
  {
    "mcpServers": {
      "opticalsetup": {
        "command": "node",
        "args": ["/absolute/path/to/opticalsetup/mcp/server.js", "--stdio"]
      }
    }
  }
  ```

  If Claude Desktop cannot find `node`, give its full path as the command
  (`which node` prints it). The tools need nothing more. Whether Claude
  Desktop lets the view load its files from `http://127.0.0.1` is the part
  still to be seen there.
- **Claude Code** can start it the same way,
  `claude mcp add opticalsetup -- node /absolute/path/to/opticalsetup/mcp/server.js --stdio`,
  or talk to a service that is already running,
  `claude mcp add --transport http opticalsetup http://127.0.0.1:5188/mcp`.
  It uses the tools as text and shows no view.
- **claude.ai and the mobile apps** reach a connector from Anthropic's
  servers, as Claude Desktop does for a connector added by URL, so the
  service needs a public HTTPS URL: the hosted one, or a tunnel to a local
  one with `PUBLIC_ORIGIN` set to the tunnel's origin. Add it under
  **Customize > Connectors > Add custom connector** with "No sign in". See
  [Test your connector](https://claude.com/docs/connectors/building/testing).

Claude names a view's sandbox origin itself, from a hash of the connector URL,
and refuses to show a view that declares any other `ui.domain`. The service
therefore declares none, and accepts the live channel from
`https://<hash>.claudemcpcontent.com`.

## Working with a connected setup

The workbench context gives the model a `workspaceRef`, the current
revision, the selection, and component/path counts. Use `get_setup` for
counts and undo/redo availability, `get_items` to look up IDs and
controls by page or exact ID, and `inspect_setup` for detector and fiber
readings. Pass `workspaceRef`, `expectedRevision` and a unique
`clientRequestId` to edit. The service reports `applied` after the browser
checks the revision and acknowledges the edit. Repeat the same arguments
and request ID for an exact retry. On a revision conflict, read the current
setup before applying another edit. Undo and redo use the browser's history.

The service waits five seconds for that acknowledgement. An edit the browser
applies later is still recorded, so repeating the call reports it as
`applied` instead of applying it twice. A view reopens its live stream every
two minutes, and after a network fault; an edit that arrives in between
waits up to three seconds for the view. An edit that arrives while a pointer
is down in the editor is refused as `BUSY`, with nothing changed.

Routine edits exchange changed items. Opening or recovering a mirror, and
some bulk replacements, can transfer the complete scene between the browser
and service. Opening a view carries any initial scene in widget metadata.
The mirror holds up to 40 workbenches, with a 750,000-byte scene limit and
expiry after ten minutes without browser sync. When it is full, a view that
has closed gives up its place to one that is open. A scene the mirror does
not take, such as one with more than 200 components, stays in the browser:
the view says why the chat does not follow it, and the mirror keeps the last
scene it took. The browser reconnects and resends its current scene after a
service restart, under the same reference. A workbench must be
connected to apply an edit. Treat its workspace reference as private: it
grants read access and lets its holder propose edits to the connected view.
Use Save JSON to keep a portable copy.

Clients without an interactive view, such as Claude Code, can still pass an
explicit `setup` snapshot to each tool and use the returned snapshot for the
next edit. For headless undo/redo, also supply `targetScene`. Results in this
mode grow with scene size and count toward the host's tool-output limit.
