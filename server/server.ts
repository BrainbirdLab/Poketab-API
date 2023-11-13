console.log('Server Initiated');

import { httpServer } from './libs/websockets.ts';

const port = 3000;


//handle requests
httpServer.on('request', (_, response) => {
    //console.log('Request Received');
    
    const {password, host, port} = Deno.env.toObject();
    
    console.log('Cred: ', password, host, port);
    response.write(`Cred: ${password}, ${host}, ${port}`);
    response.end();
});

httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});