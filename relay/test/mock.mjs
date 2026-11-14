/* A stand-in for Jira Cloud and Google's token + Gmail endpoints, for local tests. */
import http from 'node:http';
export function startMock(port = 9911) {
  const log = [];
  let n = 6;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
      log.push({ method: req.method, url: req.url, auth: req.headers.authorization || '', body });
      const u = req.url;
      if (u.startsWith('/rest/api/3/user/search')) return send(200, [{ accountId: 'acc-pranav', accountType: 'atlassian', displayName: 'Pranav Reddy' }]);
      if (u === '/rest/api/3/issue' && req.method === 'POST') return send(201, { id: String(10000 + ++n), key: `SEC-${n}` });
      if (/\/transitions$/.test(u) && req.method === 'GET') return send(200, { transitions: [{ id: '11', name: 'To Do', to: { name: 'To Do', statusCategory: { key: 'new' } } }, { id: '21', name: 'Start progress', to: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } }, { id: '31', name: 'Done', to: { name: 'Done', statusCategory: { key: 'done' } } }] });
      if (/\/transitions$/.test(u)) return send(204);
      if (/\/assignee$/.test(u)) return send(204);
      if (/\/comment$/.test(u)) return send(201, { id: 'c1' });
      if (u === '/rest/api/3/myself') return send(200, { displayName: 'NHI Bot' });
      if (/^\/rest\/api\/3\/issue\/SEC-\d+$/.test(u)) return send(204);
      if (u === '/token') return send(200, { access_token: 'ya29.test', expires_in: 3600 });
      if (u === '/gmail/v1/users/me/messages/send') return send(200, { id: 'gmail-msg-1' });
      send(404, { errorMessages: ['mock: no route ' + u] });
    });
  });
  server.listen(port);
  return { log, close: () => server.close() };
}
