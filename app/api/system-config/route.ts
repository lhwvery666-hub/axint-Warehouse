import { NextResponse } from "next/server";
import { 
  getAllConfigs, 
  getConfigByCategory, 
  updateConfig, 
  getAllRoles,
  getAllStatuses,
  getCompanyInfo,
  getBusinessConfig
} from "@/lib/system-config";
import { getDbConnection } from "@/lib/db-config";
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils";
import { UserRole } from "@/lib/enums";

/**
 * GET /api/system-config
 * 获取系统配置
 */
export async function GET(request: Request) {
  const authResult = await checkUserRole(ALL_USER_ROLES);
  if (isErrorResponse(authResult)) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const key = searchParams.get('key');
    const type = searchParams.get('type'); // roles, status, company, business

    // 根据类型返回特定配置
    if (type === 'roles') {
      const roles = await getAllRoles();
      return NextResponse.json({
        success: true,
        data: roles
      });
    }

    if (type === 'status') {
      const statuses = await getAllStatuses();
      return NextResponse.json({
        success: true,
        data: statuses
      });
    }

    if (type === 'company') {
      const companyInfo = await getCompanyInfo();
      return NextResponse.json({
        success: true,
        data: companyInfo
      });
    }

    if (type === 'business') {
      const businessConfig = await getBusinessConfig();
      return NextResponse.json({
        success: true,
        data: businessConfig
      });
    }

    // 根据key获取单个配置
    if (key) {
      const configs = await getAllConfigs();
      const config = configs.find(c => c.key === key);
      
      if (!config) {
        return NextResponse.json(
          { success: false, message: "配置不存在" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: config
      });
    }

    // 根据分类获取配置
    if (category) {
      const configs = await getConfigByCategory(category);
      return NextResponse.json({
        success: true,
        data: configs
      });
    }

    // 获取所有配置
    const configs = await getAllConfigs();
    
    // 按分类组织
    const organizedConfigs: Record<string, any[]> = {};
    configs.forEach(config => {
      if (!organizedConfigs[config.category]) {
        organizedConfigs[config.category] = [];
      }
      organizedConfigs[config.category].push(config);
    });

    return NextResponse.json({
      success: true,
      data: {
        categories: Object.keys(organizedConfigs),
        configs: organizedConfigs
      }
    });

  } catch (error: any) {
    console.error("获取系统配置失败:", error);
    return NextResponse.json(
      { success: false, message: "获取系统配置时发生错误", error: error?.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/system-config
 * 更新系统配置
 */
export async function PUT(request: Request) {
  const authResult = await checkUserRole([UserRole.ADMIN]);
  if (isErrorResponse(authResult)) return authResult;

  try {
    const body = await request.json();
    const { key, value, updatedBy } = body;

    if (!key) {
      return NextResponse.json(
        { success: false, message: "配置键不能为空" },
        { status: 400 }
      );
    }

    // 这里应该添加权限检查，确保只有管理员可以修改配置
    // 暂时跳过权限检查，实际使用时需要验证用户身份和权限

    const success = await updateConfig(key, value, updatedBy);

    if (!success) {
      return NextResponse.json(
        { success: false, message: "更新配置失败，配置不存在或无权限" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "配置更新成功"
    });

  } catch (error: any) {
    console.error("更新系统配置失败:", error);
    return NextResponse.json(
      { success: false, message: "更新系统配置时发生错误", error: error?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/system-config/batch
 * 批量更新配置
 */
export async function POST(request: Request) {
  const authResult = await checkUserRole([UserRole.ADMIN]);
  if (isErrorResponse(authResult)) return authResult;

  try {
    const body = await request.json();
    const { configs, updatedBy } = body;

    if (!Array.isArray(configs) || configs.length === 0) {
      return NextResponse.json(
        { success: false, message: "配置列表不能为空" },
        { status: 400 }
      );
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const config of configs) {
      const { key, value } = config;
      const success = await updateConfig(key, value, updatedBy);
      
      results.push({
        key,
        success
      });

      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `批量更新完成：成功 ${successCount} 个，失败 ${failCount} 个`,
      data: {
        successCount,
        failCount,
        results
      }
    });

  } catch (error: any) {
    console.error("批量更新系统配置失败:", error);
    return NextResponse.json(
      { success: false, message: "批量更新系统配置时发生错误", error: error?.message },
      { status: 500 }
    );
  }
}
