-- 为 Repair_Tickets 表的 Id 列添加 IDENTITY 自增属性
-- 注意：此操作需要重建表

USE AxinRepairDB;
GO

-- 1. 检查当前Id列配置
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMNPROPERTY(OBJECT_ID('Repair_Tickets'), 'Id', 'IsIdentity') as IsIdentity
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'Id';
GO

-- 2. 如果IsIdentity = 0，执行以下步骤：

-- 2.1 创建临时表（带IDENTITY）
IF OBJECT_ID('Repair_Tickets_Temp', 'U') IS NOT NULL
    DROP TABLE Repair_Tickets_Temp;
GO

CREATE TABLE Repair_Tickets_Temp (
    Id INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
    TicketId NVARCHAR(50),
    DeviceSN NVARCHAR(100) NOT NULL,
    ModelName NVARCHAR(200),
    DeviceName NVARCHAR(200),
    Problem NVARCHAR(MAX) DEFAULT '',
    Status NVARCHAR(50) NOT NULL DEFAULT 'created',
    Priority NVARCHAR(20) NOT NULL DEFAULT 'medium',
    Location NVARCHAR(200),
    ReportedBy NVARCHAR(100) DEFAULT '',
    ExpressCompany NVARCHAR(100),
    TrackingNumber NVARCHAR(100),
    DevicePhotos NVARCHAR(MAX),
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME2,
    ProjectLocation NVARCHAR(200),
    MaterialCode NVARCHAR(100),
    SenderAddress NVARCHAR(500),
    ContactInfo NVARCHAR(200),
    CourierInfo NVARCHAR(200),
    TrackingNumber_In NVARCHAR(100),
    RepairReportContent NVARCHAR(MAX),
    DevicesList NVARCHAR(MAX),
    DeviceCount INT,
    BatchId NVARCHAR(50)
);
GO

-- 2.2 复制数据（如果有）
SET IDENTITY_INSERT Repair_Tickets_Temp ON;

IF EXISTS (SELECT 1 FROM Repair_Tickets)
BEGIN
    INSERT INTO Repair_Tickets_Temp (
        Id, TicketId, DeviceSN, ModelName, DeviceName, Problem, Status, Priority,
        Location, ReportedBy, ExpressCompany, TrackingNumber, DevicePhotos,
        CreatedAt, UpdatedAt, ProjectLocation, MaterialCode, SenderAddress,
        ContactInfo, CourierInfo, TrackingNumber_In, RepairReportContent,
        DevicesList, DeviceCount, BatchId
    )
    SELECT 
        Id, TicketId, DeviceSN, ModelName, DeviceName, Problem, Status, Priority,
        Location, ReportedBy, ExpressCompany, TrackingNumber, DevicePhotos,
        CreatedAt, UpdatedAt, ProjectLocation, MaterialCode, SenderAddress,
        ContactInfo, CourierInfo, TrackingNumber_In, RepairReportContent,
        DevicesList, DeviceCount, BatchId
    FROM Repair_Tickets;
    
    PRINT '已复制数据';
END
ELSE
BEGIN
    PRINT '没有数据需要复制';
END

SET IDENTITY_INSERT Repair_Tickets_Temp OFF;
GO

-- 2.3 删除旧表
DROP TABLE Repair_Tickets;
GO

-- 2.4 重命名新表
EXEC sp_rename 'Repair_Tickets_Temp', 'Repair_Tickets';
GO

-- 2.5 验证结果
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMNPROPERTY(OBJECT_ID('Repair_Tickets'), 'Id', 'IsIdentity') as IsIdentity
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'Id';
GO

PRINT '✅ 修复完成！Id列现在是自增列';
GO
