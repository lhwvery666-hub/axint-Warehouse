"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Filter, Eye, Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Device {
  id: string;
  serialNumber: string;
  modelName: string;
  projectLocation: string;
  status: string;
}

export default function DeviceDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  // 从 API 获取设备数据
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/devices");
        const result = await response.json();
        if (result.success && result.data) {
          setDevices(result.data.map((d: any) => ({
            id: d.id || d.serialNumber,
            serialNumber: d.serialNumber,
            modelName: d.modelName || '',
            projectLocation: d.projectLocation || '',
            status: d.status || 'active',
          })));
        }
      } catch (error) {
        console.error("获取设备列表失败:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();
  }, []);

  // 过滤设备数据
  const filteredDevices = devices.filter(device => 
    device.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    device.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    device.projectLocation.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 获取状态徽章
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "正常":
        return <Badge className="bg-green-100 text-green-800 border-green-300">正常</Badge>;
      case "故障":
        return <Badge className="bg-red-100 text-red-800 border-red-300">故障</Badge>;
      case "离线":
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300">离线</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">设备管理</h1>
          <p className="text-gray-500 mt-1">管理和监控所有爱克信门禁设备</p>
        </div>
        <Button className="mt-4 md:mt-0">
          添加新设备
        </Button>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="搜索设备..." 
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="md:w-auto">
          <Filter className="w-4 h-4 mr-2" />
          筛选
        </Button>
      </div>

      {/* 设备统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">设备总数</p>
              <p className="text-2xl font-bold">{devices.length}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-blue-600 text-lg font-semibold">{devices.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">正常运行</p>
              <p className="text-2xl font-bold">{devices.filter(d => d.status === "active" || d.status === "正常").length}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-green-600 text-lg font-semibold">{devices.filter(d => d.status === "active" || d.status === "正常").length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">故障设备</p>
              <p className="text-2xl font-bold">{devices.filter(d => d.status === "故障").length}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-red-600 text-lg font-semibold">{devices.filter(d => d.status === "故障").length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">离线设备</p>
              <p className="text-2xl font-bold">{devices.filter(d => d.status === "离线").length}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <span className="text-gray-600 text-lg font-semibold">{devices.filter(d => d.status === "离线").length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 设备表格 */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>设备列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-6 py-3">序列号</th>
                  <th className="px-6 py-3">型号</th>
                  <th className="px-6 py-3">状态</th>
                  <th className="px-6 py-3">位置</th>
                  <th className="px-6 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      加载中...
                    </td>
                  </tr>
                ) : filteredDevices.length > 0 ? (
                  filteredDevices.map((device) => (
                    <tr key={device.id} className="border-b hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium">{device.serialNumber}</td>
                      <td className="px-6 py-4">{device.modelName}</td>
                      <td className="px-6 py-4">{getStatusBadge(device.status)}</td>
                      <td className="px-6 py-4">{device.projectLocation}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="h-8 px-2">
                            <Eye className="w-4 h-4 mr-1" />
                            查看详情
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className={`h-8 px-2 ${device.status === "故障" ? "text-red-600 border-red-300 hover:bg-red-50" : ""}`}
                            disabled={device.status === "正常"}
                          >
                            <Wrench className="w-4 h-4 mr-1" />
                            报修
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      未找到匹配的设备
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}