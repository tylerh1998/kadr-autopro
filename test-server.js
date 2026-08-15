const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*'
  });
  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }
  console.log('Received auth:', req.headers.authorization);
  res.end('ok');
});

server.listen(3000, () => {
  console.log('listening 3000');
});
