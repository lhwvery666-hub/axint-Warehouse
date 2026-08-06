SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'[dbo].[Batch_Stamp_Attachments]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[Batch_Stamp_Attachments] (
            [Id]             INT IDENTITY(1, 1) NOT NULL,
            [BatchId]        NVARCHAR(100) NOT NULL,
            [FileName]       NVARCHAR(255) NOT NULL,
            [OriginalName]   NVARCHAR(255) NOT NULL,
            [FilePath]       NVARCHAR(1000) NOT NULL,
            [MimeType]       NVARCHAR(100) NOT NULL
                CONSTRAINT [DF_Batch_Stamp_Attachments_MimeType]
                DEFAULT (N'application/octet-stream'),
            [FileSize]       BIGINT NOT NULL
                CONSTRAINT [DF_Batch_Stamp_Attachments_FileSize]
                DEFAULT ((0)),
            [UploadedById]   INT NULL,
            [UploadedByName] NVARCHAR(100) NULL,
            [UploadedByRole] NVARCHAR(50) NULL,
            [CreatedAt]      DATETIME2(7) NOT NULL
                CONSTRAINT [DF_Batch_Stamp_Attachments_CreatedAt]
                DEFAULT (SYSUTCDATETIME()),
            CONSTRAINT [PK_Batch_Stamp_Attachments]
                PRIMARY KEY CLUSTERED ([Id] ASC)
        );
    END;

    IF EXISTS (
        SELECT [RequiredColumn]
        FROM (VALUES
            (N'Id'),
            (N'BatchId'),
            (N'FileName'),
            (N'OriginalName'),
            (N'FilePath'),
            (N'MimeType'),
            (N'FileSize'),
            (N'UploadedById'),
            (N'UploadedByName'),
            (N'UploadedByRole'),
            (N'CreatedAt')
        ) AS [RequiredColumns]([RequiredColumn])
        EXCEPT
        SELECT [name]
        FROM [sys].[columns]
        WHERE [object_id] = OBJECT_ID(N'[dbo].[Batch_Stamp_Attachments]', N'U')
    )
    BEGIN
        THROW 51001, 'Batch_Stamp_Attachments exists but its column set is incomplete.', 1;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM [sys].[indexes]
        WHERE [object_id] = OBJECT_ID(N'[dbo].[Batch_Stamp_Attachments]', N'U')
          AND [name] = N'IX_Batch_Stamp_Attachments_BatchId'
    )
    BEGIN
        CREATE NONCLUSTERED INDEX [IX_Batch_Stamp_Attachments_BatchId]
            ON [dbo].[Batch_Stamp_Attachments] ([BatchId] ASC);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;
