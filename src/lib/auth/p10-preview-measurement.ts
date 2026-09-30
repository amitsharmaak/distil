/**
 * TEMPORARY P10 Preview measurement compatibility.
 *
 * Remove this module and every caller with the client timing harness after the
 * Preview sample. The proxy owns the internal header: inbound copies are
 * stripped and it may be restored only after successful legacy authentication
 * on one of the two allow-listed measurement routes.
 */
export const P10_PREVIEW_MEASURE_PARAM = "p10measure";
export const P10_PREVIEW_MEASURE_HEADER = "x-distil-p10-preview-measurement";
export const P10_PREVIEW_MEASURE_VALUE = "1";
export const P10_PREVIEW_NIL_USER_ID = "00000000-0000-0000-0000-000000000000";
