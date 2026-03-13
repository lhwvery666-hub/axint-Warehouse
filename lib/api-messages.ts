/**
 * API 日志消息配置
 * 集中管理所有API日志文本，避免硬编码
 */

// API 调试日志消息
export const API_DEBUG_MESSAGES = {
  // 接收数据
  receivedRequestBody: '接收到的完整请求体',
  receivedCustomerInfo: 'customerInfo',
  receivedItemSample: 'items[0] 示例',
  noItems: '无',
  
  // 处理设备
  processingDevice: '处理设备',
  deviceSnValue: 'deviceSn 值',
  
  // 字段添加
  addingField: (fieldName: string, value: any) => `添加 ${fieldName}: ${value || '(空)'}`,
  fieldNotExists: (fieldName: string) => `${fieldName} 字段不存在`,
  
  // SQL 执行
  preparingSql: '准备执行 SQL',
  insertFields: '插入字段',
  sqlQuery: 'SQL',
  insertSuccess: 'SQL 执行成功',
  insertFailed: 'SQL 执行失败',
  fullError: '完整错误信息',
  
  // 查询结果
  querySuccess: '查询成功',
  ticketId: '工单 ID',
  foundTicketId: (id: string) => `找到工单 ID: ${id}`,
  ticketNotFound: '未找到插入的工单',
} as const

// API 错误消息
export const API_ERROR_MESSAGES = {
  customerInfoEmpty: '客户信息和设备明细不能为空',
  customerInfoRequired: '客户名称、联系人和电话为必填项',
  deviceInfoRequired: (index: number) => `第 ${index + 1} 行：设备型号和序列号为必填项`,
  notLoggedIn: '未登录，无法创建工单',
  createFailed: (deviceSn: string, error: string) => `创建工单失败 (设备: ${deviceSn}): ${error}`,
  batchCreateFailed: '批量创建工单失败',
  batchCreateError: '批量创建工单时发生错误',
  unknownError: '未知错误',
  partialSuccess: (successCount: number, totalCount: number) => 
    `部分成功：${successCount}/${totalCount} 个工单创建成功`,
  allFailed: '所有工单创建失败',
} as const

// API 成功消息
export const API_SUCCESS_MESSAGES = {
  batchCreated: (count: number) => `成功创建 ${count} 个工单`,
  ticketCreated: '工单创建成功',
} as const

// 数据库连接消息
export const DB_MESSAGES = {
  connectionSuccess: '数据库连接池创建成功',
  connectionFailed: '数据库连接失败',
  queryFailed: '数据库查询失败',
  insertFailed: '数据库插入失败',
} as const

// 工单查询消息
export const TICKET_QUERY_MESSAGES = {
  ticketIdEmpty: '工单ID不能为空',
  ticketNotFound: '工单不存在',
  queryByIdLog: (id: string) => `使用数字ID查询: ${id}`,
  queryBySnLog: (sn: string) => `使用设备序列号查询: ${sn}`,
  getFailed: '获取维修工单详情失败',
  getError: '获取维修工单详情时发生错误',
  updateNoFields: '没有需要更新的字段',
  updateSuccess: '工单更新成功',
  updateFailed: '更新工单失败',
  updateError: '更新工单时发生错误',
  deleteFailed: '彻底删除维修工单失败',
  deleteError: '彻底删除维修工单时发生错误',
  deleteSuccess: '工单已彻底删除',
} as const
