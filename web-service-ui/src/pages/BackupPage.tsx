import { Layout, Card, Button } from '@/components/Layout';

export function BackupPage() {
  return (
    <Layout title="数据备份">
      <Card class="space-y-4">
        <p class="text-sm text-muted-foreground">
          下载 Reader 完整数据备份（与 Legado 备份格式兼容），可用于迁移或恢复。
        </p>
        <div class="flex flex-wrap gap-3">
          <Button href="/backup">下载备份包</Button>
          <Button href="/backupPreview" class="!bg-muted !text-foreground">
            预览备份内容
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">
          备份由 Reader 本地生成；若下载失败，请确认 Web 服务已启用且 Reader 正在运行。
        </p>
      </Card>
    </Layout>
  );
}
