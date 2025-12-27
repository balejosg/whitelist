/**
 * Global Application State
 */
export const state = {
    github: null,
    currentGroup: null,
    currentGroupData: null,
    currentGroupSha: null,
    currentRuleType: 'whitelist',
    allGroups: [],
    currentUser: null,
    canEdit: false
};
// Getters and setters for convenience
export function setGithub(api) { state.github = api; }
export function setCurrentUser(user) { state.currentUser = user; }
export function setCanEdit(value) { state.canEdit = value; }
//# sourceMappingURL=state.js.map