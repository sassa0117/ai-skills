/*
  Warnings:

  - You are about to drop the column `filter` on the `DashboardWidget` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DashboardWidget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodRange" TEXT NOT NULL DEFAULT 'current',
    "recentCount" INTEGER NOT NULL DEFAULT 12,
    "metric" TEXT NOT NULL,
    "dateField" TEXT NOT NULL DEFAULT 'completionDate',
    "tradingStatus" TEXT NOT NULL DEFAULT 'completed',
    "showComparison" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_DashboardWidget" ("createdAt", "id", "metric", "period", "sortOrder", "type") SELECT "createdAt", "id", "metric", "period", "sortOrder", "type" FROM "DashboardWidget";
DROP TABLE "DashboardWidget";
ALTER TABLE "new_DashboardWidget" RENAME TO "DashboardWidget";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
