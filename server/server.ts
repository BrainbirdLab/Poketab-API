console.log('Server Initiated');
// @deno-types="npm:@types/express@4"
import {Request, Response} from 'npm:express';
import {app} from './libs/websockets.ts';

app.get('/', (_: Request, res: Response) => {
    res.send('Hello world!');
});


app.get('*', (_: Request, res: Response) => {
    res.status(404).send('Hmm.. I think you\'re lost.');
});