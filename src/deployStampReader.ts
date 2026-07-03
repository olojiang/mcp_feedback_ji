import * as fs from 'fs';
import type { DeployStamp } from './deployStamp';
import { getDeployStampPath } from './configPaths';

export function readDeployStamp(): DeployStamp | null {
    try {
        if (!fs.existsSync(getDeployStampPath())) return null;
        const raw = JSON.parse(fs.readFileSync(getDeployStampPath(), 'utf-8')) as DeployStamp;
        if (!raw || typeof raw.version !== 'string' || typeof raw.at !== 'number') return null;
        return raw;
    } catch {
        return null;
    }
}
