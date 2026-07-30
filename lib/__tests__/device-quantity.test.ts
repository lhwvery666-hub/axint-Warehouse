import { describe, it } from "node:test";
import { expect } from "./test-helpers";
import { getDeviceQuantity, sumDeviceQuantity } from "@/lib/device-quantity";

describe("设备数量统计", () => {
  it("一条明细可代表多台同型号设备", () => {
    expect(sumDeviceQuantity([{ quantity: 15 }])).toBe(15);
  });

  it("批次数量按 Quantity 求和而不是按明细行数", () => {
    expect(
      sumDeviceQuantity([{ quantity: 15 }, { quantity: 2 }, { quantity: 1 }])
    ).toBe(18);
  });

  it("空值、零和非法数量按一台兼容旧数据", () => {
    expect(getDeviceQuantity({ quantity: null })).toBe(1);
    expect(getDeviceQuantity({ quantity: 0 })).toBe(1);
    expect(getDeviceQuantity({ quantity: Number.NaN })).toBe(1);
  });
});
