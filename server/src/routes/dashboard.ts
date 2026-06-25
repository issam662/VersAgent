import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { dbGet, dbAll } from '../database/index.js';
import { config } from '../config.js';

const router = Router();

// Get dashboard stats
router.get('/stats', authenticate, async (req, res, next) => {
    try {
        // 1. Machine Stats
        const totalMachines = await dbGet('SELECT COUNT(*) as count FROM machines');

        // v1.0.61 FIX: Calculate online/offline machines dynamically based on heartbeat threshold
        const onlineMachines = await dbGet(`
            SELECT COUNT(*) as count FROM machines 
            WHERE (is_managed = 1 AND last_heartbeat > DATEADD(minute, -${config.onlineThresholdMinutes}, GETUTCDATE()))
               OR (is_managed = 0 AND status = 'online')
        `);

        const offlineMachines = await dbGet(`
            SELECT COUNT(*) as count FROM machines 
            WHERE offline_reason IS NULL
              AND (
                (is_managed = 1 AND (last_heartbeat <= DATEADD(minute, -${config.onlineThresholdMinutes}, GETUTCDATE()) OR last_heartbeat IS NULL))
                OR (is_managed = 0 AND (status = 'offline' OR status IS NULL))
              )
        `);

        const interventionMachines = await dbGet(`
            SELECT COUNT(*) as count FROM machines 
            WHERE offline_reason = 'intervention'
              AND (
                (is_managed = 1 AND (last_heartbeat <= DATEADD(minute, -${config.onlineThresholdMinutes}, GETUTCDATE()) OR last_heartbeat IS NULL))
                OR (is_managed = 0 AND (status = 'offline' OR status IS NULL))
              )
        `);

        const temporaryMachines = await dbGet(`
            SELECT COUNT(*) as count FROM machines 
            WHERE offline_reason = 'temporary'
              AND (
                (is_managed = 1 AND (last_heartbeat <= DATEADD(minute, -${config.onlineThresholdMinutes}, GETUTCDATE()) OR last_heartbeat IS NULL))
                OR (is_managed = 0 AND (status = 'offline' OR status IS NULL))
              )
        `);

        const unmanagedMachines = await dbGet('SELECT COUNT(*) as count FROM machines WHERE is_managed = 0');

        // 2. Incident Stats
        const openIncidents = await dbGet("SELECT COUNT(*) as count FROM incidents WHERE status = 'Open'");
        const inProgressIncidents = await dbGet("SELECT COUNT(*) as count FROM incidents WHERE status = 'In Progress'");

        // 3. Compliance Stats
        // Calculate compliance percentage for managed machines
        // Only managed machines should have compliance checks
        const compliantMachines = await dbGet(`
            SELECT COUNT(*) as count 
            FROM machines m
            WHERE m.is_managed = 1 
            AND NOT EXISTS (
                SELECT 1 FROM compliance_results cr 
                WHERE cr.machine_id = m.id 
                AND cr.status = 'Non-Compliant'
            )
        `);

        const managedCount = await dbGet('SELECT COUNT(*) as count FROM machines WHERE is_managed = 1');

        const complianceRate = managedCount.count > 0
            ? Math.round((compliantMachines.count / managedCount.count) * 100)
            : 100;

        res.json({
            machines: {
                total: totalMachines.count,
                online: onlineMachines.count,
                offline: offlineMachines.count,
                intervention: interventionMachines.count,
                temporary: temporaryMachines.count,
                unmanaged: unmanagedMachines.count
            },
            incidents: {
                open: openIncidents.count,
                inProgress: inProgressIncidents.count
            },
            compliance: {
                rate: complianceRate,
                trend: 0 // Placeholder for now
            }
        });
    } catch (error) {
        next(error);
    }
});

export default router;
