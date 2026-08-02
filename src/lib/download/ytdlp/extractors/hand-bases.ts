/**
 * Hand-written BASE InfoExtractors — re-exported for registry / subclass use.
 * These IEs have _VALID_URL = false and must not match URLs directly.
 */

export { AdobePassIE, MSO_INFO, type MsoInfo } from './hand-a/adobepass';
export { AMPIE } from './hand-a/amp';
export { AWSIE, type AwsCredentials } from './hand-a/aws';
