import { Router } from 'express';
import { dbGet, dbAll } from '../database/index.js';
import { config } from '../config.js';

const router = Router();

// Public Stats
router.get('/stats', async (req, res, next) => {
  try {
    const totalOnline = await dbGet(`
            SELECT COUNT(*) as count 
            FROM machines 
            WHERE ((is_managed = 1 AND last_heartbeat > DATEADD(minute, -${config.onlineThresholdMinutes}, GETUTCDATE()))
               OR (is_managed = 0 AND status = 'online'))
            AND (is_archived = 0 OR is_archived IS NULL)
        `);

    const shopfloorOnline = await dbGet(`
            SELECT COUNT(*) as count 
            FROM machines m
            JOIN machine_metadata mm ON m.id = mm.machine_id
            WHERE ((m.is_managed = 1 AND m.last_heartbeat > DATEADD(minute, -${config.onlineThresholdMinutes}, GETUTCDATE()))
               OR (m.is_managed = 0 AND m.status = 'online'))
            AND mm.category = 'Shopfloor'
            AND (m.is_archived = 0 OR m.is_archived IS NULL)
        `);

    const userOnline = await dbGet(`
            SELECT COUNT(*) as count 
            FROM machines m
            JOIN machine_metadata mm ON m.id = mm.machine_id
            WHERE ((m.is_managed = 1 AND m.last_heartbeat > DATEADD(minute, -${config.onlineThresholdMinutes}, GETUTCDATE()))
               OR (m.is_managed = 0 AND m.status = 'online'))
            AND mm.category = 'User'
            AND (m.is_archived = 0 OR m.is_archived IS NULL)
        `);

    const othersOnline = await dbGet(`
            SELECT COUNT(*) as count 
            FROM machines m
            JOIN machine_metadata mm ON m.id = mm.machine_id
            WHERE ((m.is_managed = 1 AND m.last_heartbeat > DATEADD(minute, -${config.onlineThresholdMinutes}, GETUTCDATE()))
               OR (m.is_managed = 0 AND m.status = 'online'))
            AND mm.category NOT IN ('Shopfloor', 'User')
            AND (m.is_archived = 0 OR m.is_archived IS NULL)
        `);

    const openIncidents = await dbGet("SELECT COUNT(*) as count FROM incidents WHERE status = 'Open'");
    const inProgressIncidents = await dbGet("SELECT COUNT(*) as count FROM incidents WHERE status = 'In Progress'");
    const closedIncidents = await dbGet("SELECT COUNT(*) as count FROM incidents WHERE status = 'Closed'");

    const offlineCount = await dbGet(`
            SELECT COUNT(*) as count FROM machines
            WHERE offline_reason IS NULL
              AND ((is_managed = 1 AND (last_heartbeat <= DATEADD(minute, -${config.onlineThresholdMinutes}, GETUTCDATE()) OR last_heartbeat IS NULL))
               OR (is_managed = 0 AND (status = 'offline' OR status IS NULL)))
            AND (is_archived = 0 OR is_archived IS NULL)
        `);

    const interventionCount = await dbGet(`
            SELECT COUNT(*) as count FROM machines
            WHERE offline_reason = 'intervention'
            AND ((is_managed = 1 AND (last_heartbeat <= DATEADD(minute, -${config.onlineThresholdMinutes}, GETUTCDATE()) OR last_heartbeat IS NULL))
               OR (is_managed = 0 AND (status = 'offline' OR status IS NULL)))
            AND (is_archived = 0 OR is_archived IS NULL)
        `);

    const temporaryCount = await dbGet(`
            SELECT COUNT(*) as count FROM machines
            WHERE offline_reason = 'temporary'
            AND ((is_managed = 1 AND (last_heartbeat <= DATEADD(minute, -${config.onlineThresholdMinutes}, GETUTCDATE()) OR last_heartbeat IS NULL))
               OR (is_managed = 0 AND (status = 'offline' OR status IS NULL)))
            AND (is_archived = 0 OR is_archived IS NULL)
        `);

    res.json({
      pcs: {
        online: {
          total: totalOnline.count,
          shopfloor: shopfloorOnline.count,
          user: userOnline.count,
          others: othersOnline.count
        },
        offline: offlineCount.count,
        intervention: interventionCount.count,
        temporary: temporaryCount.count
      },
      incidents: {
        open: openIncidents.count,
        inProgress: inProgressIncidents.count,
        closed: closedIncidents.count
      }
    });
  } catch (error) {
    next(error);
  }
});

// Public News
router.get('/news', async (req, res, next) => {
  try {
    // Get active news, sorted by priority (sort_order) and then creation date
    const news = await dbAll(`
            SELECT * FROM news_items 
            WHERE is_active = 1 
            AND (expires_at IS NULL OR expires_at > GETUTCDATE())
            ORDER BY sort_order ASC, created_at DESC
        `);

    res.json({ newsItems: news });
  } catch (error) {
    next(error);
  }
});

// Public Settings
router.get('/settings', async (req, res, next) => {
  try {
    const { key } = req.query;
    if (!key || typeof key !== 'string') {
      res.status(400).json({ message: 'Key is required' });
      return; // Ensure we return here
    }

    const setting = await dbGet('SELECT value FROM settings WHERE [key] = ?', [key]);
    res.json({ setting });
  } catch (error) {
    next(error);
  }
});

// Public Chart Data
router.get('/charts', async (req, res, next) => {
  try {
    // Incidents created per month (last 12 months)
    const incidentsByMonth = await dbAll(`
      SELECT 
        YEAR(created_at) as yr,
        MONTH(created_at) as mo,
        COUNT(*) as count
      FROM incidents
      WHERE created_at > DATEADD(month, -12, GETUTCDATE())
      GROUP BY YEAR(created_at), MONTH(created_at)
      ORDER BY yr, mo
    `);

    // Build a full 12-month array
    const now = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const incidentsArr: { label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yr = d.getFullYear();
      const mo = d.getMonth() + 1; // 1-indexed
      const match = incidentsByMonth.find((r: any) => r.yr === yr && r.mo === mo);
      incidentsArr.push({
        label: monthNames[d.getMonth()],
        count: match ? match.count : 0
      });
    }

    // Total machines count for the category donut
    const totalMachines = await dbGet(`
      SELECT COUNT(*) as count FROM machines
      WHERE (is_archived = 0 OR is_archived IS NULL)
    `);

    res.json({
      incidentsByMonth: incidentsArr,
      totalMachines: totalMachines?.count || 0
    });
  } catch (error) {
    next(error);
  }
});

// Share storage usage - pure PowerShell, no Add-Type/P/Invoke compilation
let shareCache: { data: any[]; ts: number } | null = null;
const SHARE_CACHE_MS = 30_000; // 30s cache

router.get('/share-usage', async (_req, res) => {
  try {
    // Return cached data if still fresh
    if (shareCache && Date.now() - shareCache.ts < SHARE_CACHE_MS) {
      res.json(shareCache.data);
      return;
    }

    const sharesToWatch = [
      { name: 'PFT FOLDER',   path: '\\\\10.71.5.25\\groupe01\\pft'             },
      { name: 'EUMOOUJ-FP01', path: '\\\\10.71.5.25\\groupe01'                  },
      { name: 'KSK M5',       path: '\\\\10.192.40.249\\M5'                      },
      { name: 'IT',           path: '\\\\10.71.5.25\\groupe01\\IT'              },
      { name: 'EVERYONE',     path: '\\\\10.71.5.25\\groupe01\\Everyone'         },
      { name: 'BACKUP',       path: '\\\\10.71.5.25\\groupe01\\PROGRAM-BACKUP'  },
      { name: 'PUBLIC',       path: '\\\\10.71.5.25\\groupe01\\Public'           }
    ];

    const { execSync } = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const scriptPath = path.join(os.tmpdir(), 'versagent_shares_check.ps1');
    const shareUser = process.env.SHARE_USER || '';
    const sharePass = process.env.SHARE_PASS || '';

    let psScript = `$ErrorActionPreference = 'SilentlyContinue'\n`;

    if (shareUser && sharePass) {
      const servers = [...new Set(sharesToWatch.map(s => {
        const m = s.path.match(/^\\\\([^\\]+)/);
        return m ? `\\\\${m[1]}` : null;
      }).filter(Boolean) as string[])];

      servers.forEach(server => {
        psScript += `net use "${server}" /delete /y 2>$null | Out-Null\n$null = net use "${server}" /user:"${shareUser}" "${sharePass}" /persistent:no 2>&1\n`;
      });
    }

    psScript += `\n$results = @()\n`;

    const driveLetters = ['Z', 'Y', 'X', 'W', 'V', 'U', 'T', 'S'];
    sharesToWatch.forEach((s, idx) => {
      const driveLetter = driveLetters[idx] || 'Q';
      const psPath = s.path;
      psScript += `\n# --- ${s.name} ---\nnet use ${driveLetter}: /delete /y 2>$null | Out-Null\n$null = net use ${driveLetter}: "${psPath}" /user:"${shareUser}" "${sharePass}" /persistent:no 2>&1\n$drv${idx} = New-Object System.IO.DriveInfo('${driveLetter}:')\nif ($drv${idx}.IsReady) {\n    $results += @{ name='${s.name}'; path='${psPath}'; ok=$true; total=[long]$drv${idx}.TotalSize; free=[long]$drv${idx}.AvailableFreeSpace }\n} else {\n    $results += @{ name='${s.name}'; path='${psPath}'; ok=$false; total=[long]0; free=[long]0 }\n}\nnet use ${driveLetter}: /delete /y 2>$null | Out-Null\n`;
    });

    psScript += `\n$results | ConvertTo-Json -Depth 3\n`;

    fs.writeFileSync(scriptPath, psScript, 'utf8');

    const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
      encoding: 'utf8',
      timeout: 30000
    }).trim();

    try { fs.unlinkSync(scriptPath); } catch {}

    const jsonStart = raw.indexOf('[');
    const objStart  = raw.indexOf('{');
    let jsonStr: string;
    if (jsonStart >= 0) {
      jsonStr = raw.slice(jsonStart);
    } else if (objStart >= 0) {
      jsonStr = '[' + raw.slice(objStart) + ']';
    } else {
      jsonStr = raw;
    }
    const results = JSON.parse(jsonStr);

    const formattedResults = (Array.isArray(results) ? results : [results]).map((r: any) => {
      if (r.ok) {
        return {
          name: r.name,
          path: r.path,
          totalBytes: r.total,
          freeBytes: r.free,
          usedBytes: r.total - r.free,
          usedPercent: r.total > 0 ? Math.round(((r.total - r.free) / r.total) * 100) : 0,
          ok: true
        };
      } else {
        return { name: r.name, path: r.path, ok: false, error: 'Access Denied' };
      }
    });

    shareCache = { data: formattedResults, ts: Date.now() };
    res.json(formattedResults);
  } catch (error: any) {
    console.error('Shares usage check failed:', error.message);
    res.status(500).json({ error: 'Failed to check shares', message: error.message });
  }
});

export default router;
