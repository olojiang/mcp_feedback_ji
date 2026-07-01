"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectTimeline = void 0;
const fileStore_1 = require("../fileStore");
class ProjectTimeline {
    constructor(messageCap, saveDelayMs = 1000) {
        this.saveTimer = null;
        this.messages = [];
        this.workspaces = [];
        this.projHash = '';
        this.messageCap = messageCap;
        this.saveDelayMs = saveDelayMs;
    }
    setWorkspaces(workspaces) {
        this.workspaces = workspaces;
        this.projHash = workspaces.length > 0 ? (0, fileStore_1.projectHash)(workspaces[0]) : '';
        this.loadFromDisk();
    }
    addMessage(msg) {
        this.messages.push(msg);
        if (this.messages.length > this.messageCap) {
            this.messages = this.messages.slice(-this.messageCap);
        }
        this.saveDebounced();
    }
    getMessages() {
        return this.messages;
    }
    dispose() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
    }
    loadFromDisk() {
        if (!this.projHash) {
            this.messages = [];
            return;
        }
        const proj = (0, fileStore_1.readProject)(this.projHash);
        this.messages = proj ? proj.messages.slice(-this.messageCap) : [];
    }
    saveDebounced() {
        if (this.saveTimer)
            return;
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.saveNow();
        }, this.saveDelayMs);
    }
    saveNow() {
        if (!this.projHash || this.workspaces.length === 0)
            return;
        const state = {
            projectPath: this.workspaces[0],
            messages: this.messages.slice(-this.messageCap),
            lastActive: Date.now(),
        };
        (0, fileStore_1.writeProject)(this.projHash, state);
    }
}
exports.ProjectTimeline = ProjectTimeline;
//# sourceMappingURL=projectTimeline.js.map