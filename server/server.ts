console.log('Server Initiated');

import { httpServer } from './libs/websockets.ts';

const port = 3000;


//handle requests
httpServer.on('request', (req, response) => {
    if (req.url === '/') {
        response.writeHead(200, {'Content-Type': 'text/html'});
        response.end('Server Running');
    } else if (req.url === '/ping'){
        response.writeHead(200, {'Content-Type': 'text/html'});
        response.end('pong');
    } else {
        response.writeHead(404, {'Content-Type': 'text/html'});
        response.end('404 Not Found');
    }
});

httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});