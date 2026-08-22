/**
 * Detect AWS WAF / CloudFront interstitial challenge pages (often HTTP 202).
 */

export function isAwsWafChallengeHtml(html: string | null | undefined): boolean {
  if (!html) return false;
  const sample = html.length > 8000 ? html.slice(0, 8000) : html;
  return (
    /AwsWafIntegration/i.test(sample) ||
    /awswaf\.com\/[^"'>\s]+\/challenge\.js/i.test(sample) ||
    /window\.gokuProps\s*=/i.test(sample) ||
    /x-amzn-waf-action/i.test(sample)
  );
}
