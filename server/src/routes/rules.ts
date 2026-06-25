import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbAll, dbRun } from '../database/index.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { evaluateAllMachinesCompliance, evaluateMachineCompliance } from '../services/compliance.js';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { type, active } = req.query;
        let whereClause = 'WHERE 1=1';
        const params: any[] = [];
        if (type) { whereClause += ' AND r.rule_type = ?'; params.push(type); }
        if (active !== undefined) { whereClause += ' AND r.is_active = ?'; params.push(active === 'true' ? 1 : 0); }
        const query = `
            SELECT r.*,
                (SELECT COUNT(*) FROM compliance_results cr WHERE cr.rule_id = r.id) as violation_count
            FROM compliance_rules r
            ${whereClause}
            ORDER BY r.rule_type, r.name
        `;
        const rules = await dbAll(query, params);
        res.json({ rules });
    } catch (error) { next(error); }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const rule = await dbGet('SELECT * FROM compliance_rules WHERE id = ?', [req.params.id]);
        if (!rule) throw createError('Rule not found', 404);
        const exceptions = await dbAll('SELECT re.*, m.hostname FROM rule_exceptions re JOIN machines m ON re.machine_id = m.id WHERE re.rule_id = ?', [req.params.id]);
        res.json({ rule, exceptions });
    } catch (error) { next(error); }
});

// Get machines violating a specific rule
router.get('/:id/violations', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const rule = await dbGet('SELECT * FROM compliance_rules WHERE id = ?', [req.params.id]);
        if (!rule) throw createError('Rule not found', 404);
        const machines = await dbAll(`
            SELECT m.id, m.hostname, m.os_name, m.status, mm.category, cr.details
            FROM compliance_results cr
            JOIN machines m ON cr.machine_id = m.id
            LEFT JOIN machine_metadata mm ON m.id = mm.machine_id
            WHERE cr.rule_id = ?
            ORDER BY m.hostname
        `, [req.params.id]);
        res.json({ machines });
    } catch (error) { next(error); }
});

router.post('/', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { name, ruleType, appName, severity, description, versionOperator, versionValue } = req.body;
        if (!name || !ruleType) throw createError('Name and rule type required', 400);
        const id = uuidv4();
        await dbRun('INSERT INTO compliance_rules (id, name, rule_type, app_name, severity, description, version_operator, version_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, name, ruleType, appName || null, severity || 'warning', description || null, versionOperator || null, versionValue || null]);
        await logAudit(req.user?.id || null, req.user?.username || '', `Created compliance rule: ${name}`, 'compliance_rule', id, null, { name }, req.ip || '', req.headers['user-agent'] as string || '');

        // Trigger a re-evaluation for all machines asynchronously
        evaluateAllMachinesCompliance().catch(console.error);

        res.status(201).json({ id, message: 'Rule created' });
    } catch (error) { next(error); }
});

router.put('/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { name, ruleType, appName, severity, description, isActive, versionOperator, versionValue } = req.body;

        const existing = await dbGet('SELECT * FROM compliance_rules WHERE id = ?', [req.params.id]) as any;
        if (!existing) throw createError('Rule not found', 404);

        const newName = name !== undefined ? name : existing.name;
        const newRuleType = ruleType !== undefined ? ruleType : existing.rule_type;
        const newAppName = appName !== undefined ? appName : existing.app_name;
        const newSeverity = severity !== undefined ? severity : existing.severity;
        const newDescription = description !== undefined ? description : existing.description;
        const newIsActive = isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active;
        const newVersionOperator = versionOperator !== undefined ? (versionOperator || null) : existing.version_operator;
        const newVersionValue = versionValue !== undefined ? (versionValue || null) : existing.version_value;

        await dbRun(
            'UPDATE compliance_rules SET name = ?, rule_type = ?, app_name = ?, severity = ?, description = ?, is_active = ?, version_operator = ?, version_value = ?, updated_at = GETUTCDATE() WHERE id = ?',
            [newName, newRuleType, newAppName, newSeverity, newDescription, newIsActive, newVersionOperator, newVersionValue, req.params.id]
        );

        const rule = await dbGet('SELECT name FROM compliance_rules WHERE id = ?', [req.params.id]) as any;
        await logAudit(req.user?.id || null, req.user?.username || '', `Updated compliance rule: ${rule?.name || req.params.id}`, 'compliance_rule', req.params.id, null, req.body, req.ip || '', req.headers['user-agent'] as string || '');

        // Trigger a re-evaluation for all machines asynchronously
        evaluateAllMachinesCompliance().catch(console.error);

        res.json({ message: 'Rule updated' });
    } catch (error) { next(error); }
});

router.delete('/:id', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const r = await dbGet('SELECT name FROM compliance_rules WHERE id = ?', [req.params.id]) as any;
        await dbRun('DELETE FROM compliance_rules WHERE id = ?', [req.params.id]);
        await logAudit(req.user?.id || null, req.user?.username || '', `Deleted compliance rule: ${r?.name || 'Unknown'}`, 'compliance_rule', req.params.id, null, null, req.ip || '', req.headers['user-agent'] as string || '');

        // Trigger a re-evaluation for all machines asynchronously
        evaluateAllMachinesCompliance().catch(console.error);

        res.json({ message: 'Deleted' });
    } catch (error) { next(error); }
});

router.post('/:id/exceptions', authenticate, authorize('SuperAdmin', 'Admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { machineId, reason, expiresAt } = req.body;
        if (!machineId || !reason) throw createError('Machine ID and reason required', 400);
        const id = uuidv4();
        await dbRun('INSERT INTO rule_exceptions (id, rule_id, machine_id, reason, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)', [id, req.params.id, machineId, reason, expiresAt || null, req.user?.id]);

        // Get rule name/machine name for better log
        const rule = await dbGet('SELECT name FROM compliance_rules WHERE id = ?', [req.params.id]) as any;
        const machine = await dbGet('SELECT hostname FROM machines WHERE id = ?', [machineId]) as any;

        await logAudit(
            req.user?.id || null,
            req.user?.username || '',
            `Granted exception for rule '${rule?.name}' to machine '${machine?.hostname}'`,
            'rule_exception',
            id,
            null,
            { ruleId: req.params.id, machineId, reason, expiresAt },
            req.ip || '',
            req.headers['user-agent'] as string || ''
        );

        // Re-evaluate just this machine asynchronously
        evaluateMachineCompliance(machineId).catch(console.error);

        res.status(201).json({ id, message: 'Exception added' });
    } catch (error) { next(error); }
});

export default router;
