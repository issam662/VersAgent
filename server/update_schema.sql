DECLARE @ConstraintName nvarchar(200)

SELECT @ConstraintName = name 
FROM sys.objects 
WHERE type = 'C' AND parent_object_id = OBJECT_ID('compliance_rules')
AND name LIKE '%rule_type%' OR name LIKE '%CK__compliance_rules__rule_type%';

-- We'll just find the only CHECK constraint on compliance_rules
SELECT @ConstraintName = name 
FROM sys.check_constraints 
WHERE parent_object_id = OBJECT_ID('compliance_rules')
AND definition LIKE '%rule_type%';

IF @ConstraintName IS NOT NULL
BEGIN
    DECLARE @SQL nvarchar(1000) = 'ALTER TABLE compliance_rules DROP CONSTRAINT ' + @ConstraintName
    EXEC(@SQL)
    PRINT 'Dropped constraint: ' + @ConstraintName
END
ELSE
BEGIN
    PRINT 'No existing constraint found.'
END

ALTER TABLE compliance_rules 
ADD CONSTRAINT CK_compliance_rules_rule_type 
CHECK (rule_type IN ('mandatory', 'blacklist', 'outdated', 'os', 'software_required', 'required_os'));

PRINT 'Added new constraint.'
