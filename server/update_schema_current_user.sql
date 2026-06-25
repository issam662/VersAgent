IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'machines' AND COLUMN_NAME = 'current_user'
)
BEGIN
    ALTER TABLE machines ADD [current_user] NVARCHAR(255)
    PRINT 'Added current_user column to machines table.'
END
ELSE
BEGIN
    PRINT 'current_user column already exists in machines table.'
END
