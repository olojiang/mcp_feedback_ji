"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleHttpRoute = handleHttpRoute;
function buildOpenApiSpec(deps) {
    return {
        openapi: '3.0.3',
        info: {
            title: 'MCP Feedback API',
            version: deps.version,
            description: 'Local diagnostic API exposed by the MCP Feedback extension.',
        },
        servers: [{ url: `http://127.0.0.1:${deps.port}` }],
        paths: {
            '/health': {
                get: {
                    summary: 'Return extension server health and version.',
                    responses: {
                        '200': {
                            description: 'Extension server is reachable.',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['ok', 'port', 'pid', 'version'],
                                        properties: {
                                            ok: { type: 'boolean' },
                                            port: { type: 'integer' },
                                            pid: { type: 'integer' },
                                            version: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/pending': {
                get: {
                    summary: 'Read or consume queued pending feedback.',
                    parameters: [{
                            name: 'consume',
                            in: 'query',
                            required: false,
                            schema: { type: 'string', enum: ['1'] },
                            description: 'Set to 1 to consume the pending entry.',
                        }],
                    responses: {
                        '200': {
                            description: 'Pending feedback exists.',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['comments', 'images'],
                                        properties: {
                                            comments: { type: 'array', items: { type: 'string' } },
                                            images: { type: 'array', items: { type: 'string' } },
                                        },
                                    },
                                },
                            },
                        },
                        '404': {
                            description: 'No pending feedback exists.',
                        },
                    },
                },
            },
            '/feedback-active': {
                get: {
                    summary: 'Whether interactive_feedback is already waiting for this trace.',
                    parameters: [{
                            name: 'trace_id',
                            in: 'query',
                            required: true,
                            schema: { type: 'string' },
                        }],
                    responses: {
                        '200': {
                            description: 'A live feedback wait exists for the trace.',
                        },
                        '404': {
                            description: 'No live wait for this trace.',
                        },
                    },
                },
            },
        },
    };
}
function docsHtml(deps) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MCP Feedback API</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:860px;margin:40px auto;padding:0 20px;line-height:1.5}
    code{background:#f3f4f6;padding:2px 5px;border-radius:4px}
    pre{background:#111827;color:#f9fafb;padding:14px;border-radius:6px;overflow:auto}
  </style>
</head>
<body>
  <h1>MCP Feedback API</h1>
  <p>Local diagnostic API for this extension instance.</p>
  <ul>
    <li><code>GET /health</code> - server health, port, pid, and version.</li>
    <li><code>GET /pending</code> - read pending feedback.</li>
    <li><code>GET /pending?consume=1</code> - consume pending feedback.</li>
    <li><code>GET /feedback-active?trace_id=...</code> - live feedback wait for hooks.</li>
    <li><code>GET /openapi.json</code> - OpenAPI 3.0 JSON.</li>
  </ul>
  <pre>curl http://127.0.0.1:${deps.port}/openapi.json</pre>
</body>
</html>`;
}
function handleHttpRoute(req, res, deps) {
    const url = new URL(req.url || '/', `http://127.0.0.1:${deps.port}`);
    const pathname = url.pathname;
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && pathname === '/openapi.json') {
        res.writeHead(200);
        res.end(JSON.stringify(buildOpenApiSpec(deps)));
        return true;
    }
    if (req.method === 'GET' && pathname === '/docs') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.writeHead(200);
        res.end(docsHtml(deps));
        return true;
    }
    if (req.method === 'GET' && pathname === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({
            ok: true,
            port: deps.port,
            pid: process.pid,
            version: deps.version,
        }));
        return true;
    }
    if (req.method === 'GET' && pathname === '/pending') {
        const consume = url.searchParams.get('consume') === '1';
        const entry = consume ? deps.pending.consume() : deps.pending.read();
        if (entry) {
            if (consume)
                deps.log(`HTTP consume pending: comments=${entry.comments.length}`);
            res.writeHead(200);
            res.end(JSON.stringify({ comments: entry.comments, images: entry.images }));
        }
        else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'no_pending' }));
        }
        return true;
    }
    if (req.method === 'GET' && pathname === '/feedback-active') {
        const traceId = url.searchParams.get('trace_id') || '';
        const live = deps.feedback?.liveWaitForTrace(traceId) ?? null;
        if (live) {
            res.writeHead(200);
            res.end(JSON.stringify({ active: true, ...live }));
        }
        else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'no_active_wait' }));
        }
        return true;
    }
    return false;
}
//# sourceMappingURL=httpRoutes.js.map