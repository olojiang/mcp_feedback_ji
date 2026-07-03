"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeProjectPath = normalizeProjectPath;
exports.projectPathRelation = projectPathRelation;
exports.projectPathMatches = projectPathMatches;
exports.hubAcceptsProject = hubAcceptsProject;
exports.sessionBelongsToPanel = sessionBelongsToPanel;
exports.projectMismatchLogLine = projectMismatchLogLine;
const path = __importStar(require("node:path"));
function normalizeProjectPath(dir) {
    const normalized = path.normalize(dir);
    const root = path.parse(normalized).root;
    if (normalized === root)
        return root;
    const stripped = normalized.replace(/[\\/]+$/, '');
    return stripped || root || normalized;
}
function projectPathRelation(entryPath, want) {
    if (!want)
        return 'exact';
    if (!entryPath)
        return 'none';
    const entry = normalizeProjectPath(entryPath);
    const target = normalizeProjectPath(want);
    if (entry === target)
        return 'exact';
    if (target.startsWith(entry + path.sep))
        return 'ancestor';
    if (entry.startsWith(target + path.sep))
        return 'descendant';
    return 'none';
}
function projectPathMatches(entryPath, want) {
    return projectPathRelation(entryPath, want) !== 'none';
}
function hubAcceptsProject(hubWorkspaces, projectDirectory) {
    if (!projectDirectory)
        return true;
    if (!hubWorkspaces.length)
        return true;
    return hubWorkspaces.some((ws) => projectPathMatches(ws, projectDirectory));
}
function sessionBelongsToPanel(panelWorkspace, projectDirectory, hubWorkspaces) {
    if (!projectDirectory)
        return true;
    const roots = hubWorkspaces?.length
        ? hubWorkspaces
        : (panelWorkspace ? [panelWorkspace] : []);
    if (!roots.length)
        return true;
    return roots.some((ws) => projectPathMatches(ws, projectDirectory));
}
function projectMismatchLogLine(want, hubWorkspaces) {
    return `feedbackRequest: rejected project_mismatch want=${want} hub=${hubWorkspaces.join('|')}`;
}
//# sourceMappingURL=workspaceMatch.js.map