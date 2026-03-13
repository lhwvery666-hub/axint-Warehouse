/**
 * workflow-utils 单元测试
 * 确保状态聚合逻辑的正确性
 */

import { describe, it, expect } from '@jest/globals';
import {
  AggregatedStatus,
  getAggregatedStatus,
  countByAggregatedStatus,
  validateStatusMapping,
  getAggregatedStatusInfo,
  STATUS_TO_AGGREGATED_MAP,
  getBatchAggregatedStatus,
} from '../workflow-utils';
import { TicketStatus } from '../enums';

describe('workflow-utils', () => {
  describe('validateStatusMapping', () => {
    it('应该验证映射表覆盖了所有 TicketStatus', () => {
      expect(() => validateStatusMapping()).not.toThrow();
    });

    it('映射表应该包含所有枚举值', () => {
      const allStatuses = Object.values(TicketStatus);
      const mappedStatuses = Object.keys(STATUS_TO_AGGREGATED_MAP);
      
      allStatuses.forEach(status => {
        expect(mappedStatuses).toContain(status);
      });
    });
  });

  describe('getAggregatedStatus', () => {
    it('应该正确映射标准工作流状态', () => {
      expect(getAggregatedStatus(TicketStatus.CREATED)).toBe(AggregatedStatus.PENDING_RECEIVE);
      // TicketStatus.IN_REPAIR（旧状态）现在映射到 INSPECTING（检测中）
      expect(getAggregatedStatus(TicketStatus.IN_REPAIR)).toBe(AggregatedStatus.INSPECTING);
      // 维修中阶段对应 TECHNICIAN_REPAIRING
      expect(getAggregatedStatus(TicketStatus.TECHNICIAN_REPAIRING)).toBe(AggregatedStatus.IN_REPAIR);
      expect(getAggregatedStatus(TicketStatus.PENDING_REPORTER_CONFIRM)).toBe(AggregatedStatus.PENDING_SIGNATURE);
      expect(getAggregatedStatus(TicketStatus.BUSINESS_REVIEW)).toBe(AggregatedStatus.PENDING_REVIEW);
      expect(getAggregatedStatus(TicketStatus.WAREHOUSE_SHIPPING)).toBe(AggregatedStatus.PENDING_SHIPPING);
      expect(getAggregatedStatus(TicketStatus.COMPLETED)).toBe(AggregatedStatus.COMPLETED);
    });

    it('应该正确映射异常状态', () => {
      expect(getAggregatedStatus(TicketStatus.UNREPAIRABLE)).toBe(AggregatedStatus.ABNORMAL);
      expect(getAggregatedStatus(TicketStatus.CANCELLED)).toBe(AggregatedStatus.ABNORMAL);
      expect(getAggregatedStatus(TicketStatus.SCRAPPED)).toBe(AggregatedStatus.ABNORMAL);
    });

    it('应该处理兼容旧状态', () => {
      expect(getAggregatedStatus(TicketStatus.PENDING)).toBe(AggregatedStatus.PENDING_RECEIVE);
      // PROCESSING 旧状态现在映射到 INSPECTING（检测阶段）
      expect(getAggregatedStatus(TicketStatus.PROCESSING)).toBe(AggregatedStatus.INSPECTING);
      expect(getAggregatedStatus(TicketStatus.ADMIN_REVIEW)).toBe(AggregatedStatus.PENDING_REVIEW);
    });

    it('应该处理字符串状态', () => {
      expect(getAggregatedStatus('Created')).toBe(AggregatedStatus.PENDING_RECEIVE);
      // 'In_Repair' 字符串（旧 TicketStatus.IN_REPAIR）现在映射到 INSPECTING
      expect(getAggregatedStatus('In_Repair')).toBe(AggregatedStatus.INSPECTING);
    });

    it('应该处理空值', () => {
      expect(getAggregatedStatus(null)).toBe(AggregatedStatus.ABNORMAL);
      expect(getAggregatedStatus(undefined)).toBe(AggregatedStatus.ABNORMAL);
      expect(getAggregatedStatus('')).toBe(AggregatedStatus.ABNORMAL);
    });

    it('应该处理无效状态', () => {
      expect(getAggregatedStatus('INVALID_STATUS')).toBe(AggregatedStatus.ABNORMAL);
    });
  });

  describe('getAggregatedStatusInfo', () => {
    it('应该返回所有聚合状态的配置', () => {
      const info = getAggregatedStatusInfo(AggregatedStatus.PENDING_RECEIVE);
      expect(info).toHaveProperty('label');
      expect(info).toHaveProperty('color');
      expect(info).toHaveProperty('icon');
      expect(info).toHaveProperty('description');
    });

    it('所有聚合状态都应该有配置', () => {
      Object.values(AggregatedStatus).forEach(status => {
        const info = getAggregatedStatusInfo(status);
        expect(info).toBeDefined();
        expect(info.label).toBeTruthy();
      });
    });
  });

  describe('countByAggregatedStatus', () => {
    it('应该正确统计空数组', () => {
      const counts = countByAggregatedStatus([]);
      expect(counts[AggregatedStatus.PENDING_RECEIVE]).toBe(0);
      expect(counts[AggregatedStatus.INSPECTING]).toBe(0);
      expect(counts[AggregatedStatus.IN_REPAIR]).toBe(0);
    });

    it('应该正确统计工单状态', () => {
      const tickets = [
        { status: TicketStatus.CREATED },
        { status: TicketStatus.CREATED },
        { status: TicketStatus.IN_REPAIR },   // 旧状态，现在映射到 INSPECTING
        { status: TicketStatus.COMPLETED },
      ];

      const counts = countByAggregatedStatus(tickets);
      expect(counts[AggregatedStatus.PENDING_RECEIVE]).toBe(2);
      expect(counts[AggregatedStatus.INSPECTING]).toBe(1); // IN_REPAIR(旧) 映射到 INSPECTING
      expect(counts[AggregatedStatus.IN_REPAIR]).toBe(0);  // 无 TECHNICIAN_REPAIRING
      expect(counts[AggregatedStatus.COMPLETED]).toBe(1);
      expect(counts[AggregatedStatus.ABNORMAL]).toBe(0);
    });

    it('应该兼容大小写不同的字段名', () => {
      const tickets = [
        { status: TicketStatus.CREATED },
        { Status: TicketStatus.IN_REPAIR }, // 大写 S，旧状态映射到 INSPECTING
      ];

      const counts = countByAggregatedStatus(tickets);
      expect(counts[AggregatedStatus.PENDING_RECEIVE]).toBe(1);
      expect(counts[AggregatedStatus.INSPECTING]).toBe(1); // IN_REPAIR(旧) 映射到 INSPECTING
    });

    it('应该处理包含空值的列表', () => {
      const tickets = [
        { status: TicketStatus.CREATED },
        null,
        { status: null },
        { status: undefined },
        { status: TicketStatus.COMPLETED },
      ];

      const counts = countByAggregatedStatus(tickets as any);
      expect(counts[AggregatedStatus.PENDING_RECEIVE]).toBe(1);
      expect(counts[AggregatedStatus.COMPLETED]).toBe(1);
      expect(counts[AggregatedStatus.ABNORMAL]).toBe(2); // null 和 undefined
    });

    it('应该处理非数组输入', () => {
      const counts = countByAggregatedStatus(null as any);
      // 应该返回全为 0 的计数
      Object.values(counts).forEach(count => {
        expect(count).toBe(0);
      });
    });

    it('性能测试：应该能处理大量数据', () => {
      const largeTicketList = Array.from({ length: 10000 }, (_, i) => ({
        status: i % 2 === 0 ? TicketStatus.CREATED : TicketStatus.COMPLETED,
      }));

      const startTime = Date.now();
      const counts = countByAggregatedStatus(largeTicketList);
      const endTime = Date.now();

      expect(counts[AggregatedStatus.PENDING_RECEIVE]).toBe(5000);
      expect(counts[AggregatedStatus.COMPLETED]).toBe(5000);
      expect(endTime - startTime).toBeLessThan(100); // 应在 100ms 内完成
    });
  });

  describe('getBatchAggregatedStatus', () => {
    it('应该返回进度最高的状态', () => {
      const tickets = [
        { status: TicketStatus.CREATED },
        { status: TicketStatus.IN_REPAIR },
        { status: TicketStatus.PENDING_REPORTER_CONFIRM },
      ];

      const result = getBatchAggregatedStatus(tickets);
      expect(result).toBe(TicketStatus.PENDING_REPORTER_CONFIRM); // 优先级最高
    });

    it('应该处理相同状态', () => {
      const tickets = [
        { status: TicketStatus.IN_REPAIR },
        { status: TicketStatus.IN_REPAIR },
        { status: TicketStatus.IN_REPAIR },
      ];

      const result = getBatchAggregatedStatus(tickets);
      expect(result).toBe(TicketStatus.IN_REPAIR);
    });

    it('应该忽略终止状态', () => {
      const tickets = [
        { status: TicketStatus.CREATED },
        { status: TicketStatus.UNREPAIRABLE }, // 优先级0
        { status: TicketStatus.CANCELLED }, // 优先级0
      ];

      const result = getBatchAggregatedStatus(tickets);
      expect(result).toBe(TicketStatus.CREATED); // 使用有效进度的状态
    });

    it('应该处理空数组', () => {
      const result = getBatchAggregatedStatus([]);
      expect(result).toBe(TicketStatus.CREATED);
    });

    it('应该处理包含null的数据', () => {
      const tickets = [
        { status: TicketStatus.CREATED },
        { status: null },
        { status: undefined },
      ];

      const result = getBatchAggregatedStatus(tickets as any);
      expect(result).toBe(TicketStatus.CREATED);
    });

    it('应该兼容大小写字段名', () => {
      const tickets = [
        { status: TicketStatus.CREATED },
        { Status: TicketStatus.COMPLETED }, // 大写S
      ];

      const result = getBatchAggregatedStatus(tickets);
      expect(result).toBe(TicketStatus.COMPLETED);
    });

    it('应该正确处理完整工作流', () => {
      const tickets = [
        { status: TicketStatus.WAREHOUSE_CONFIRMED },
        { status: TicketStatus.IN_REPAIR },
        { status: TicketStatus.TECHNICIAN_REPAIRING },
        { status: TicketStatus.BUSINESS_REVIEW },
      ];

      const result = getBatchAggregatedStatus(tickets);
      expect(result).toBe(TicketStatus.BUSINESS_REVIEW); // 最后阶段
    });
  });
});
