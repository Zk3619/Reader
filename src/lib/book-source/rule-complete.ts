/**
 * 规则自动补全（对齐 Legado RuleComplete.kt）
 */

const NEED_COMPLETE =
  /(?<!(@|\/|^|[|%&]{2})(attr|text|ownText|textNodes|href|content|html|alt|all|value|src)(\(\))?)(?<seq>&{2}|%%|\|{2}|$)/g;

const NOT_COMPLETE = /^:|^##|\{\{|@js:|<js>|@Json:|\$\./;

const FIX_IMG_INFO =
  /(?<=(^|tag\.|[+/@>~| &]))img(?<at>(\[@?.+\]|\.[-\w]+)?)[@/]+text(\(\))?(?<seq>&{2}|%%|\|{2}|$)/g;

const IS_XPATH = /^\/\/|^@Xpath:/;

/**
 * @param type 1=文字(默认) 2=链接 3=图片
 */
export function autoCompleteRule(
  rules: string | undefined | null,
  preRule?: string | null,
  type: number = 1,
): string | undefined {
  if (!rules?.trim()) return rules ?? undefined;
  if (NOT_COMPLETE.test(rules) || (preRule && NOT_COMPLETE.test(preRule))) {
    return rules;
  }

  const parts = rules.split(/(##|,\{)/);
  let cleanedRule = parts[0] ?? '';
  let tailStr = '';
  if (parts.length > 1) {
    tailStr = parts.slice(1).join('');
  }

  const isXpath = IS_XPATH.test(cleanedRule);
  const textRule = isXpath ? '//text()${seq}' : '@text${seq}';
  const linkRule = isXpath ? '//@href${seq}' : '@href${seq}';
  const imgRule = isXpath ? '//@src${seq}' : '@src${seq}';
  const imgText = 'img${at}@alt${seq}';

  const replaceWithTemplate = (input: string, template: string) =>
    input.replace(NEED_COMPLETE, (_m, _a, _b, _c, seq: string) =>
      template.replace('${seq}', seq ?? ''),
    );

  let result = cleanedRule;
  if (type === 1) {
    result = replaceWithTemplate(cleanedRule, textRule);
    result = result.replace(FIX_IMG_INFO, (_m, _prefix, at: string, _p2, _p3, seq: string) =>
      imgText.replace('${at}', at ?? '').replace('${seq}', seq ?? ''),
    );
  } else if (type === 2) {
    result = replaceWithTemplate(cleanedRule, linkRule);
  } else if (type === 3) {
    result = replaceWithTemplate(cleanedRule, imgRule);
  } else {
    return rules;
  }

  return result + tailStr;
}
