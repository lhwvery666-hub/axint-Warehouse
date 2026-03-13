import { NextResponse } from "next/server";
import { getConfig, getConfigs, setConfig, getConfigsByCategory } from "@/lib/config";

/**
 * GET /api/config
 * 获取系统配置
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const category = searchParams.get('category');
    const keys = searchParams.get('keys');

    // 单个配置
    if (key) {
      const value = await getConfig(key);
      return NextResponse.json({
        success: true,
        data: { [key]: value }
      });
    }

    // 多个配置
    if (keys) {
      const keyArray = keys.split(',');
      const configs = await getConfigs(keyArray);
      return NextResponse.json({
        success: true,
        data: configs
      });
    }

    // 按分类获取
    const configs = await getConfigsByCategory(category || undefined);
    return NextResponse.json({
      success: true,
      data: configs
    });

  } catch (error: any) {
    console.error("获取配置失败:", error);
    return NextResponse.json(
      { success: false, message: "获取配置时发生错误", error: error?.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/config
 * 更新系统配置（仅管理员）
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key) {
      return NextResponse.json(
        { success: false, message: "配置键为必填项" },
        { status: 400 }
      );
    }

    // TODO: 添加管理员权限检查
    // const { user } = await getServerSession();
    // if (user.role !== 'admin') {
    //   return NextResponse.json({ success: false, message: "无权限" }, { status: 403 });
    // }

    const success = await setConfig(key, value);

    if (!success) {
      return NextResponse.json(
        { success: false, message: "更新配置失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "配置已更新"
    });

  } catch (error: any) {
    console.error("更新配置失败:", error);
    return NextResponse.json(
      { success: false, message: "更新配置时发生错误", error: error?.message },
      { status: 500 }
    );
  }
}
