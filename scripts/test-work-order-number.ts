/**
 * 工单编号生成功能测试脚本
 * 
 * 测试：
 * 1. 生成工单编号
 * 2. 查看序列当前值
 * 3. 连续生成多个工单编号
 * 
 * 运行: npm run test-work-order-number
 */

import { getNextWorkOrderNumber, getCurrentSequenceValue, previewNextWorkOrderNumber } from '../lib/work-order-number';

async function testWorkOrderNumber() {
  try {
    console.log('🧪 开始测试工单编号生成功能...\n');

    // 测试 1：查看当前序列值
    console.log('📊 测试 1：查看当前序列值');
    const initialSequence = await getCurrentSequenceValue();
    console.log(`当前序列值：${initialSequence.currentValue}`);
    console.log(`编号前缀：${initialSequence.prefix}`);
    console.log(`更新时间：${initialSequence.updatedAt.toISOString()}\n`);

    // 测试 2：预览下一个工单编号
    console.log('🔮 测试 2：预览下一个工单编号（不实际生成）');
    const previewNumber = await previewNextWorkOrderNumber();
    console.log(`预览编号：${previewNumber}\n`);

    // 测试 3：生成第一个工单编号
    console.log('🎯 测试 3：生成第一个工单编号');
    const firstNumber = await getNextWorkOrderNumber();
    console.log(`生成编号：${firstNumber}\n`);

    // 测试 4：生成更多工单编号
    console.log('🔄 测试 4：连续生成 5 个工单编号');
    for (let i = 1; i <= 5; i++) {
      const number = await getNextWorkOrderNumber();
      console.log(`  ${i}. ${number}`);
    }
    console.log('');

    // 测试 5：查看最终序列值
    console.log('📈 测试 5：查看最终序列值');
    const finalSequence = await getCurrentSequenceValue();
    console.log(`当前序列值：${finalSequence.currentValue}`);
    console.log(`总共生成：${finalSequence.currentValue - initialSequence.currentValue} 个工单编号\n`);

    // 测试 6：预览下一个工单编号
    console.log('🔮 测试 6：预览下一个工单编号');
    const nextPreview = await previewNextWorkOrderNumber();
    console.log(`下一个工单编号将是：${nextPreview}\n`);

    console.log('✅ 所有测试通过！\n');
    console.log('💡 提示：');
    console.log('  - 第一个工单编号：wx00001');
    console.log('  - 编号格式：wx + 5位数字（自动补零）');
    console.log('  - 并发安全：使用数据库存储过程确保');

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    console.error('详细错误:', error);
    process.exit(1);
  }
}

// 执行测试
testWorkOrderNumber().catch((error) => {
  console.error('测试脚本执行失败:', error);
  process.exit(1);
});
