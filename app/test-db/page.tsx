"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function TestDbPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; error?: string } | null>(null);

  const testConnection = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/db/test');
      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      setResult({
        success: false,
        message: '请求失败',
        error: error.message || '未知错误'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 dark:from-background dark:via-background dark:to-primary/10 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>数据库连接测试</CardTitle>
            <CardDescription>
              测试 SQL Server 数据库连接配置
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">连接信息：</p>
              <div className="bg-muted p-4 rounded-lg space-y-1 text-sm font-mono">
                <p><span className="text-muted-foreground">Server:</span> localhost</p>
                <p><span className="text-muted-foreground">Database:</span> AxinRepairDB</p>
                <p><span className="text-muted-foreground">User:</span> AxinUser</p>
                <p><span className="text-muted-foreground">Port:</span> 1433</p>
              </div>
            </div>

            <Button 
              onClick={testConnection} 
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  测试连接中...
                </>
              ) : (
                '测试数据库连接'
              )}
            </Button>

            {result && (
              <div className={`p-4 rounded-lg border ${
                result.success 
                  ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                  : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-start gap-3">
                  {result.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-1">
                    <p className={`font-medium ${
                      result.success 
                        ? 'text-green-900 dark:text-green-100' 
                        : 'text-red-900 dark:text-red-100'
                    }`}>
                      {result.message}
                    </p>
                    {result.error && (
                      <p className="text-sm text-red-700 dark:text-red-300 font-mono">
                        {result.error}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
