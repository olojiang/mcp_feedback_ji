import * as http from 'node:http';
import { PendingManager } from './pendingManager';
import type { FeedbackManager } from './feedbackManager';
export interface HttpRoutesDeps {
    port: number;
    version: string;
    pending: PendingManager;
    feedback?: Pick<FeedbackManager, 'liveWaitForTrace'>;
    log: (msg: string) => void;
}
export declare function handleHttpRoute(req: http.IncomingMessage, res: http.ServerResponse, deps: HttpRoutesDeps): boolean;
