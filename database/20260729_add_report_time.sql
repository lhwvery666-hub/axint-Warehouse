SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.Repair_Tickets', N'U') IS NULL
        THROW 50001, 'dbo.Repair_Tickets does not exist.', 1;

    IF COL_LENGTH(N'dbo.Repair_Tickets', N'ReportTime') IS NULL
    BEGIN
        ALTER TABLE dbo.Repair_Tickets
        ADD ReportTime datetime2(7) NULL;
    END
    ELSE IF NOT EXISTS (
        SELECT 1
        FROM sys.columns AS c
        INNER JOIN sys.types AS t
            ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(N'dbo.Repair_Tickets')
          AND c.name = N'ReportTime'
          AND t.name = N'datetime2'
          AND c.scale = 7
          AND c.is_nullable = 1
    )
    BEGIN
        THROW 50002, 'ReportTime exists but is not datetime2(7) NULL.', 1;
    END;

    -- SQL Server compiles a batch before executing ALTER TABLE. Compile the
    -- backfill only after the column has been created in this transaction.
    EXEC sys.sp_executesql N'
        UPDATE dbo.Repair_Tickets
        SET ReportTime = COALESCE(SubmitDate, CreatedAt)
        WHERE ReportTime IS NULL
          AND COALESCE(SubmitDate, CreatedAt) IS NOT NULL;
    ';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;

EXEC sys.sp_executesql N'
    SELECT
        COUNT_BIG(*) AS TicketRows,
        SUM(CASE WHEN ReportTime IS NULL THEN 1 ELSE 0 END) AS NullReportTimeRows,
        MIN(ReportTime) AS EarliestReportTime,
        MAX(ReportTime) AS LatestReportTime
    FROM dbo.Repair_Tickets;
';
