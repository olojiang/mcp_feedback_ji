export declare const RULES_CONTENT: string;
export interface RulesDeployPlan {
    writeGlobal: boolean;
    removeWorkspaceRules: string[];
}
export declare function planRulesDeploy(existingGlobalContent: string | null, workspacePaths: string[]): RulesDeployPlan;
