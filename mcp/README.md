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
the view loads its files and its live channel from it.

A client may start the service more than once; Claude Desktop starts two
copies for one chat, one that hands it the view and one that takes its tool
calls. Workbenches live in the memory of one process, so only the first copy
on a machine keeps them. A copy started with `--stdio` that finds the same
build of this service already on its port (5188, or the one `PORT` names)
opens no listener and passes every message to that copy. The build is a
digest of the service's and the editor's files, which `/mcp/health` reports
as `build`; the version number alone does not tell two checkouts apart.

What a relying copy checks is the build, on every message, not the process.
Each message it passes on names its build in an `x-opticalsetup-build`
header. A service of another build refuses such a message before reading it
(HTTP 409), and every answer on `/mcp` carries the build that gave it; an
answer without the same build is not taken. So if another build of this
service takes the port between two calls, it carries nothing out. A copy of
the same build that took the port is used as the first was; it holds none of
the earlier workbenches. A client that sends no such header is answered as
before.

This does not keep a message from a program that is not this service, or
from a build older than this check, if one takes the port: that program
receives the one message that finds it there and may act on it; its answer
is not taken, and nothing more is sent. The view has the same limit, since it loads its files
and its live channel from that port.

A copy that relies on another one never takes its place. If a call is not
answered by its build while that build still holds the port, the call fails
with a message that it may have been carried out all the same: read the
setup before repeating it. If the port is empty or held by anything else,
nothing more is sent, and every call fails with a message to restart the
client that started OpticalSetup. For Claude Desktop that is the app itself,
which starts and ends both copies together.

If something else holds port 5188, or another build of this service, the
service takes a free port and says on standard error that it runs apart
from it. With `PORT` set it does not: it fails to start.

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

`open_setup` returns a `workspaceRef` for the view it opens, so the model
can edit in the same turn; a call that names it waits up to eight seconds
for the view to load. The workbench context repeats the reference, with the
current revision, the selection, and component/path counts. Use `get_setup` for
counts and undo/redo availability, `get_items` to look up IDs and
controls by page or exact ID, and `inspect_setup` for detector and fiber
readings. Pass `workspaceRef`, `expectedRevision` and a unique
`clientRequestId` to edit. The service reports `applied` after the browser
checks the revision and acknowledges the edit. Repeat the same arguments
and request ID for an exact retry. It reports what became of that edit, even
when the setup has changed since or is no longer shared. On a revision
conflict, read the current setup before applying another edit. Undo and redo
use the browser's history.

The service waits five seconds for that acknowledgement. An edit the browser
applies later is still recorded, so repeating the call reports it as
`applied` instead of applying it twice. Up to eight edits can be waiting for
the browser's answer this way. They were all computed on the same scene, so
at most one of them is applied, and the others then report a revision
conflict. A view reopens its live stream every
two minutes, and after a network fault; an edit that arrives in between
waits up to three seconds for the view. An edit that arrives while a pointer
is down in the editor is refused as `BUSY`, with nothing changed.

A reading from `inspect_setup` keeps its numbers, notes and model limits and
leaves out the curves the editor plots from it: a spectrum, a pulse envelope,
a field. Each one is named in its place with its length, for example
`{"omitted": 1024, "curve": "pulse.envelope.intensity"}`. What sums a curve
up (band limits, duration, energy, peak power) is in the reading beside it.
The rule is a limit on what one answer carries: any list of nine or more
items is left out. The lists of caveats (`approximations`, `phaseIssues`)
are the exception and always arrive whole.
To read a curve, pass one ID in `ids` with `curve`; `sampleOffset` and
`sampleLimit` (128 by default, 256 at most) choose the window. This is the
same with a `workspaceRef` and with an explicit `setup`.

Routine edits exchange changed items. Opening or recovering a mirror, and
some bulk replacements, can transfer the complete scene between the browser
and service. Opening a view carries any initial scene in widget metadata.
The mirror holds up to 40 workbenches, with a 750,000-byte scene limit and
expiry after ten minutes without browser sync. When it is full, a view that
has closed gives up its place to one that is open, unless one of its edits
is still unconfirmed. A scene the mirror does not take, such as one with
more than 200 components, stays in the browser. The view says why the chat
does not follow it, and reads and edits by its reference fail with
`WORKSPACE_NOT_SHARED` and the same reason, instead of answering from the
scene the mirror took last, until the scene is one it takes again. A scene
whose sync would not fit in a request to the service (950,000 bytes; one
very long text label is enough) is not sent at all: the view tells the
service so in a few bytes, with the same result. If something on the way
refuses a request as too large, the view reports it the same way and does
not send that size again. If a larger request fails with no answer the
browser may read, as when a proxy refuses it without CORS headers, the view
cannot tell that from a lost connection: it tells the service in a few
bytes that the scene has not reached it, and goes on trying, less and less
often. A proxy in front of the service should take requests of 950,000
bytes. The
browser reconnects and resends its current scene after a
service restart, under the reference of its own channel. A workbench must
be connected to apply an edit. Treat the workspace reference as private: it
grants read access and lets its holder propose edits to the connected view.
Use Save JSON to keep a portable copy.

The reference is the hash of a ticket that the open result carries in its
metadata for the view alone. The first view to register with the ticket,
within two minutes of the call, takes the reference; knowing the reference
is not enough. The view's channel stays its own, and only the channel reads
the stream or confirms an edit.

The reference then names that one view for good. A stored result can be
shown again, in a reloaded chat or a second tab, and the new view presents
the same ticket, but the reference never moves to it: the new view works
under a reference of its own, which its workbench context gives. An edit and
its exact retry therefore always reach the same view. The service remembers
which view a reference belongs to after that view's mirror has expired (for
up to 200 references), so the same view comes back to its reference and no
other view can take it. After a service restart this is forgotten, and every
view goes on under its own reference. The service expects at most 200 opened
views at a time; one opened past that works under its own reference too.
A reference does not keep the scene: the scene is the copy in browser
storage, as before. In a client that shows no view, the first call by the
reference waits those eight seconds and is then told to pass an explicit
setup.

Clients without an interactive view, such as Claude Code, can still pass an
explicit `setup` snapshot to each tool and use the returned snapshot for the
next edit. For headless undo/redo, also supply `targetScene`. Results in this
mode grow with scene size and count toward the host's tool-output limit.
