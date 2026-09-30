/**
 * TEMPORARY P10 Preview measurement harness.
 *
 * Remove this module and its callers before P10 merges. The proxy strips this
 * header from every inbound request and may re-add it only after successful
 * legacy authentication for the explicit probe query parameter.
 */
export const P10_PREVIEW_PROBE_PARAM = "p10_probe";
export const P10_PREVIEW_PROBE_HEADER = "x-distil-p10-preview-probe";
export const P10_PREVIEW_PROBE_VALUE = "1";
export const P10_PREVIEW_NIL_USER_ID = "00000000-0000-0000-0000-000000000000";
