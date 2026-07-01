import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { ConnectedClient } from './clientRegistry';
interface ConnectionHandlerDeps {
    onParsedMessage: (raw: RawData) => void;
    onDisconnect: () => void;
}
export declare function bindClientConnectionHandlers(ws: WebSocket, client: ConnectedClient, deps: ConnectionHandlerDeps): void;
export {};
