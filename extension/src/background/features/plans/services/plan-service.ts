// Feed and profile-viewer features still own their Free-limit enforcement in
// this feature. Billing owns the authenticated subscription lookup, so every
// enforcement path resolves the same entitlement as the extension UI.
export { clearUserPlanCache, getUserPlanSnapshot } from '../../billing/public';
