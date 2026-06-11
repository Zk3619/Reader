/**
 * 对齐 Legado RssJsExtensions：规则 @js 中的 java.setContent / java.getElements
 */

import { parseCss, selectElementsOuterHtml } from '@/lib/rule-engine/css-parser';
import { getRegexElements, regexGroupsToElementContent } from '@/lib/rule-engine/regex-parser';

export type RuleJavaAnalyzeBridge = {
  setContent: (content: unknown, baseUrl?: unknown) => RuleJavaAnalyzeBridge;
  setBaseUrl: (baseUrl: unknown) => RuleJavaAnalyzeBridge;
  getElements: (ruleStr: string) => string[];
};

export function createRuleJavaAnalyzeBridge(options: {
  baseUrl: string;
  initialContent?: string;
}): RuleJavaAnalyzeBridge {
  let content = options.initialContent ?? '';
  let _baseUrl = options.baseUrl;

  const bridge: RuleJavaAnalyzeBridge = {
    setContent(c: unknown, url?: unknown) {
      content = c == null ? '' : String(c);
      if (url != null && String(url).trim()) {
        _baseUrl = String(url).trim();
      }
      return bridge;
    },
    setBaseUrl(url: unknown) {
      if (url != null && String(url).trim()) {
        _baseUrl = String(url).trim();
      }
      return bridge;
    },
    getElements(ruleStr: string): string[] {
      void _baseUrl;
      const rule = String(ruleStr ?? '').trim();
      if (!rule || !content.trim()) return [];
      if (rule.startsWith(':')) {
        return getRegexElements(rule.slice(1).trim(), content)
          .map((groups) => regexGroupsToElementContent(groups))
          .filter((s) => s.trim().length > 0);
      }
      if (rule.includes('@') || rule.includes('&&') || rule.includes('||') || rule.includes('%%')) {
        return parseCss(rule, content).filter((s) => s.trim().length > 0);
      }
      return selectElementsOuterHtml(rule, content);
    },
  };

  return bridge;
}
