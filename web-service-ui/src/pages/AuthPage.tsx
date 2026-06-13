import { createSignal, Show } from 'solid-js';
import { Layout, Card, Button, Input, Label } from '@/components/Layout';
import { getStoredWebToken, setStoredWebToken } from '@/lib/api';

export function AuthPage() {
  const [token, setToken] = createSignal(getStoredWebToken());
  const [saved, setSaved] = createSignal(false);

  function save() {
    setStoredWebToken(token());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Layout title="Web 认证">
      <Card class="max-w-md space-y-4">
        <p class="text-sm text-muted-foreground">
          若 Reader 设置中启用了 Web 服务认证，请在此填写 Token。保存后本页会话内的 API 与 WebSocket 请求将自动携带。
        </p>
        <Label hint="与 Reader 设置 → Web 服务 → Token 一致">访问 Token</Label>
        <Input value={token()} onInput={setToken} placeholder="Bearer Token" />
        <Button onClick={save}>保存 Token</Button>
        <Show when={saved()}>
          <p class="text-sm web-text-success">已保存</p>
        </Show>
      </Card>
    </Layout>
  );
}
