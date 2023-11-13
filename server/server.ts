console.log('Server Initiated');

import { httpServer } from './libs/websockets.ts';

const port = 3000;


//handle requests
httpServer.on('request', (req, response) => {
    if (req.url === '/') {
        response.writeHead(200, {'Content-Type': 'text/html'});
        response.end(`<h1>Server Running</h1>`);
    } else if (req.url === '/ping'){
        response.writeHead(200, {'Content-Type': 'text/html'});
        response.end('pong');
    }
});

httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});