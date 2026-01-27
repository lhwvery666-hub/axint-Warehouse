import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 分析 Excel 文件中的物料名称统计
 */
async function analyzeData() {
  try {
    // 获取项目根目录
    const rootDir = path.resolve(__dirname, '..');
    const excelPath = path.join(rootDir, 'import_data.xlsx');

    console.log(`📖 正在读取 Excel 文件: ${excelPath}`);

    // 检查文件是否存在
    if (!fs.existsSync(excelPath)) {
      console.error(`❌ 文件不存在: ${excelPath}`);
      process.exit(1);
    }

    // 读取 Excel 文件
    const workbook = XLSX.readFile(excelPath);
    
    // 获取第一个工作表
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      console.error('❌ Excel 文件中没有找到工作表');
      process.exit(1);
    }

    const sheet = workbook.Sheets[sheetName];
    
    // 将工作表转换为 JSON 数组（第一行作为标题行）
    const jsonData = XLSX.utils.sheet_to_json<any>(sheet, {
      defval: '',
      raw: false,
    });

    if (jsonData.length === 0) {
      console.error('❌ Excel 文件中没有数据');
      process.exit(1);
    }

    console.log(`✅ 成功读取 ${jsonData.length} 行数据\n`);

    // 统计物料名称
    const materialCount: Record<string, number> = {};

    for (const row of jsonData) {
      // 查找"物料名称"列（支持多种可能的列名）
      const materialName = row['物料名称'] || row['物料'] || row['名称'] || '';
      
      if (materialName && materialName.trim() !== '') {
        const name = materialName.trim();
        materialCount[name] = (materialCount[name] || 0) + 1;
      }
    }

    // 转换为数组并按数量排序
    const sortedMaterials = Object.entries(materialCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // 打印统计结果
    console.log('📊 物料名称统计（前 50 名）\n');
    console.log('=' .repeat(60));

    const top50 = sortedMaterials.slice(0, 50);
    
    top50.forEach((item, index) => {
      console.log(`${(index + 1).toString().padStart(2, ' ')}. ${item.name} : ${item.count} 台`);
    });

    console.log('=' .repeat(60));
    console.log(`\n📈 统计摘要:`);
    console.log(`   - 总物料种类: ${sortedMaterials.length} 种`);
    console.log(`   - 总设备数量: ${sortedMaterials.reduce((sum, item) => sum + item.count, 0)} 台`);
    console.log(`   - 前 50 名占比: ${((top50.reduce((sum, item) => sum + item.count, 0) / sortedMaterials.reduce((sum, item) => sum + item.count, 0)) * 100).toFixed(2)}%`);

  } catch (error: any) {
    console.error('❌ 分析失败:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// 运行分析
analyzeData();
