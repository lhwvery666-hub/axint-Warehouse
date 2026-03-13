/**
 * 表单标签和提示文本配置
 * 集中管理所有UI文本，避免硬编码
 */

// 表单字段标签
export const FORM_LABELS = {
  // 客户信息
  customerName: '客户名称',
  contactPerson: '联系人姓名',
  contactPhone: '联系电话',
  
  // 项目信息
  projectLocation: '项目名称',
  senderAddress: '寄件人详细地址',
  
  // 快递信息
  expressCompany: '物流名称',
  trackingNumber: '发出快递单号',
  
  // 设备信息
  deviceCategory: '一级分类',
  deviceSubCategory: '二级分类',
  deviceModel: '型号',
  deviceSerialNumber: '设备序列号',
  faultDescription: '故障描述',
  devicePhoto: '设备照片',
  
  // 其他
  selectHistory: '选择历史客户信息（快速填充）',
} as const

// 表单占位符文本
export const FORM_PLACEHOLDERS = {
  customerName: '请输入客户名称/公司名称',
  contactPerson: '请输入联系人姓名',
  contactPhone: '请输入11位手机号码',
  projectLocation: '请输入项目名称',
  senderAddress: '请完整输入寄件人地址（包含省市区和详细地址，例如：广东省深圳市宝安区石岩街道办民生三路料坑嘉一达工业园6栋2楼）',
  expressCompany: '请输入快递公司名称',
  trackingNumber: '请输入发出快递单号（字母和数字组合，至少8位）',
  deviceCategory: '选择一级分类',
  deviceSubCategory: '选择二级分类',
  deviceModel: '选择型号',
  deviceSerialNumber: '请输入设备序列号，如 N74C1120 或 SJ-2304M01013',
  faultDescription: '请详细描述故障原因，包括症状、发生频率和相关观察...',
  selectHistory: '选择之前使用过的客户信息...',
} as const

// 表单错误消息
export const FORM_ERRORS = {
  // 客户信息
  customerNameRequired: '请输入客户名称',
  contactPersonRequired: '请输入联系人姓名',
  contactPhoneRequired: '请输入联系电话',
  contactPhoneInvalid: '请输入有效的11位手机号码',
  
  // 项目信息
  projectLocationRequired: '请输入项目名称',
  senderAddressRequired: '请输入完整的寄件人地址（包含省市区和详细地址，至少10个字符）',
  
  // 快递信息
  expressCompanyRequired: '请输入物流名称',
  trackingNumberRequired: '请输入发出快递单号',
  trackingNumberInvalid: '请输入有效的快递单号（至少8位字母和数字组合）',
  
  // 设备信息
  deviceCategoryRequired: '请选择一级分类',
  deviceSubCategoryRequired: '请选择二级分类',
  deviceModelRequired: '请选择设备型号',
  deviceSerialNumberRequired: '请输入设备序列号',
  faultDescriptionRequired: '请描述故障情况',
  faultDescriptionTooShort: '故障描述至少需要3个字符',
  devicePhotoRequired: '标签磨损/无法辨识时，请上传设备照片',
} as const

// Toast 提示消息
export const TOAST_MESSAGES = {
  historySelected: '已自动填充',
  copyDeviceSuccess: '复制成功',
  copyDeviceError: '上一个设备还未选择分类，无法复制',
} as const

// 提示信息
export const INFO_MESSAGES = {
  senderAddressHint: '请完整输入地址信息，包括：省份、城市、区县、街道、门牌号等详细信息',
  deviceCategoryLoading: '加载中...',
  deviceCategoryEmpty: '产品目录中暂无分类，请先导入数据',
  deviceSubCategoryEmpty: '当前分类下暂无子类',
  deviceSubCategorySelectFirst: '请先选择一级分类',
  deviceModelSelectFirst: '请先选择二级分类',
  deviceModelEmpty: '当前分类下暂无型号',
} as const

// 按钮文本
export const BUTTON_LABELS = {
  addDevice: '添加设备',
  copyLastDevice: '复制上一行',
  submit: '提交故障报修',
  submitting: '提交中...',
} as const

// 辅助类型
export type FormLabelKey = keyof typeof FORM_LABELS
export type FormPlaceholderKey = keyof typeof FORM_PLACEHOLDERS
export type FormErrorKey = keyof typeof FORM_ERRORS
export type ToastMessageKey = keyof typeof TOAST_MESSAGES
export type InfoMessageKey = keyof typeof INFO_MESSAGES
export type ButtonLabelKey = keyof typeof BUTTON_LABELS
