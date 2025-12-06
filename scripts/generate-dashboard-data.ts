// scripts/generate-dashboard-data.ts
// Generate dashboard data for GitHub Pages

import * as fs from 'fs';
import * as path from 'path';

const dashboardData = {
  generated_at: new Date().toISOString(),
  status: "operational",
  message: "Dashboard data generated successfully"
};

const outputPath = path.join(__dirname, '..', 'docs', 'dashboard-data.json');
fs.writeFileSync(outputPath, JSON.stringify(dashboardData, null, 2));

console.log('Dashboard data generated:', outputPath);
