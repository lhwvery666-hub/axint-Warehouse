// 全局上传目录配置
// 注意：这是后端运行时使用的物理路径，前端不会直接使用这个路径
// 将来部署到服务器时，只需要修改这里的路径（或改为读取环境变量）即可
// 例如：D:\\repair-photos 或 /data/repair-photos

export const UPLOAD_DIR: string =
  process.env.UPLOAD_DIR ||
  "F:\\\\维修系统照片" // 本地开发默认存储到 F:\维修系统照片

