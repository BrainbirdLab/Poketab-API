console.log('Server Initiated');

import { httpServer } from './libs/websockets.js';

const port = 3000;

httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});