import type { RawData } from 'ws';
import type { WSMessage } from '../types';
export declare function decodeWsMessage(raw: RawData): WSMessage;
