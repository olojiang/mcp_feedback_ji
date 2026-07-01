import * as http from 'node:http';
import { PendingManager } from './pendingManager';
export interface HttpRoutesDeps {
    port: number;
    version: string;
    pending: PendingManager;
    log: (msg: string) => void;
}
export declare function handleHttpRoute(req: http.IncomingMessage, res: http.ServerResponse, deps: HttpRoutesDeps): boolean;
