console.log('Server Initiated');

import { httpServer } from './libs/websockets.ts';

const port = 3000;

//handle requests
httpServer.on('request', (_, response) => {
    //console.log('Request Received');
    
    response.write('Hello World');
    response.end();
});

httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});