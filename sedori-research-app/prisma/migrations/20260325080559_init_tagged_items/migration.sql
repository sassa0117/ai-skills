-- CreateTable
CREATE TABLE "TaggedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "mercariId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "soldDate" TEXT NOT NULL,
    "photos" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "category" TEXT,
    "shippingMethod" TEXT,
    "sellerName" TEXT,
    "ipName" TEXT,
    "series" TEXT,
    "productType" TEXT,
    "gradeRank" TEXT,
    "accessories" TEXT,
    "limitedType" TEXT,
    "hasTop" BOOLEAN,
    "hasBottom" BOOLEAN,
    "topNote" TEXT,
    "bottomNote" TEXT,
    "releaseYear" INTEGER,
    "memo" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "TaggedItem_mercariId_key" ON "TaggedItem"("mercariId");

-- CreateIndex
CREATE INDEX "TaggedItem_series_idx" ON "TaggedItem"("series");

-- CreateIndex
CREATE INDEX "TaggedItem_ipName_idx" ON "TaggedItem"("ipName");

-- CreateIndex
CREATE INDEX "TaggedItem_productType_idx" ON "TaggedItem"("productType");
