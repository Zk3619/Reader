import { createResource, createSignal, For, Show } from 'solid-js';
import { Layout, Card, Button, ErrorBox, Loading, Input, TextArea, Label } from '@/components/Layout';
import {
  deleteReplaceRule,
  getReplaceRules,
  saveReplaceRule,
  testReplaceRule,
  type ReplaceRule,
} from '@/lib/api';
import { formatResourceError, resourceError } from '@/lib/resource';

function emptyRule(): ReplaceRule {
  return {
    id: 0,
    name: '',
    pattern: '',
    replacement: '',
    scopeTitle: false,
    scopeContent: true,
    isEnabled: true,
    isRegex: true,
    timeoutMillisecond: 3000,
    order: 0,
  };
}

export function ReplaceRulesPage() {
  const [search, setSearch] = createSignal('');
  const [editRule, setEditRule] = createSignal<ReplaceRule | null>(null);
  const [testText, setTestText] = createSignal('测试文本');
  const [testResult, setTestResult] = createSignal('');
  const [actionError, setActionError] = createSignal('');

  const [rules, { refetch }] = createResource(getReplaceRules);

  const filtered = () => {
    const q = search().trim().toLowerCase();
    const list = rules() ?? [];
    if (!q) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.pattern.toLowerCase().includes(q) ||
        (r.group ?? '').toLowerCase().includes(q),
    );
  };

  async function handleSave() {
    const rule = editRule();
    if (!rule) return;
    setActionError('');
    try {
      await saveReplaceRule(rule);
      setEditRule(null);
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(rule: ReplaceRule) {
    if (!confirm(`确定删除规则「${rule.name}」？`)) return;
    setActionError('');
    try {
      await deleteReplaceRule(rule);
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleTest() {
    const rule = editRule();
    if (!rule) return;
    setActionError('');
    try {
      const result = await testReplaceRule(rule, testText());
      setTestResult(result);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Layout title="替换规则">
      <Show when={resourceError(rules) || actionError()}>
        <ErrorBox message={String(formatResourceError(resourceError(rules), '') || actionError())} />
      </Show>

      <div class="mb-4 flex flex-wrap gap-2">
        <Input class="max-w-xs flex-1" value={search()} onInput={setSearch} placeholder="搜索规则…" />
        <Button onClick={() => setEditRule(emptyRule())}>新建</Button>
      </div>

      <Show when={!rules.loading && !resourceError(rules)} fallback={<Loading />}>
        <Show when={filtered().length} fallback={<Card>暂无替换规则</Card>}>
          <div class="space-y-2">
            <For each={filtered()}>
              {(r) => (
                <Card class="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium">{r.name}</p>
                    <p class="truncate font-mono text-xs text-muted-foreground">{r.pattern}</p>
                    <p class="truncate text-xs">→ {r.replacement || '(空)'}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class={`rounded-full px-2 py-0.5 text-xs ${r.isEnabled ? 'web-badge-success' : 'bg-muted'}`}>
                      {r.isEnabled ? '启用' : '禁用'}
                    </span>
                    <Button variant="ghost" class="px-3! py-1!" onClick={() => setEditRule({ ...r })}>
                      编辑
                    </Button>
                    <Button variant="danger" class="px-3! py-1!" onClick={() => handleDelete(r)}>
                      删除
                    </Button>
                  </div>
                </Card>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={editRule()}>
        {(rule) => (
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card class="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-y-auto">
              <h2 class="text-lg font-semibold">{rule().id ? '编辑规则' : '新建规则'}</h2>
              <Label>名称</Label>
              <Input value={rule().name} onInput={(v) => setEditRule((r) => r ? { ...r, name: v } : r)} />
              <Label>正则 / 匹配</Label>
              <TextArea value={rule().pattern} onInput={(v) => setEditRule((r) => r ? { ...r, pattern: v } : r)} rows={3} />
              <Label>替换为</Label>
              <TextArea value={rule().replacement} onInput={(v) => setEditRule((r) => r ? { ...r, replacement: v } : r)} rows={2} />
              <div class="flex flex-wrap gap-4 text-sm">
                <label class="flex items-center gap-2">
                  <input type="checkbox" checked={rule().isRegex} onChange={(e) => setEditRule((r) => r ? { ...r, isRegex: e.currentTarget.checked } : r)} />
                  正则
                </label>
                <label class="flex items-center gap-2">
                  <input type="checkbox" checked={rule().scopeContent} onChange={(e) => setEditRule((r) => r ? { ...r, scopeContent: e.currentTarget.checked } : r)} />
                  作用于正文
                </label>
                <label class="flex items-center gap-2">
                  <input type="checkbox" checked={rule().scopeTitle} onChange={(e) => setEditRule((r) => r ? { ...r, scopeTitle: e.currentTarget.checked } : r)} />
                  作用于标题
                </label>
                <label class="flex items-center gap-2">
                  <input type="checkbox" checked={rule().isEnabled} onChange={(e) => setEditRule((r) => r ? { ...r, isEnabled: e.currentTarget.checked } : r)} />
                  启用
                </label>
              </div>
              <div class="border-t border-border pt-3">
                <Label>测试文本</Label>
                <TextArea value={testText()} onInput={setTestText} rows={3} />
                <Button class="mt-2" variant="secondary" onClick={handleTest}>测试</Button>
                <Show when={testResult()}>
                  <pre class="mt-2 max-h-32 overflow-auto rounded-lg bg-muted p-2 text-xs">{testResult()}</pre>
                </Show>
              </div>
              <div class="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditRule(null)}>取消</Button>
                <Button onClick={handleSave}>保存</Button>
              </div>
            </Card>
          </div>
        )}
      </Show>
    </Layout>
  );
}
