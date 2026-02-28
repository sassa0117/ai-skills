-- CreateTable
CREATE TABLE "IpFranchise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "romBase" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IpKeyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    CONSTRAINT "IpKeyword_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "IpFranchise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postUrl" TEXT,
    "postDate" DATETIME,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "replies" INTEGER NOT NULL DEFAULT 0,
    "reposts" INTEGER NOT NULL DEFAULT 0,
    "profileClicks" INTEGER NOT NULL DEFAULT 0,
    "linkClicks" INTEGER NOT NULL DEFAULT 0,
    "followerDelta" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" REAL NOT NULL DEFAULT 0,
    "videoViews" INTEGER NOT NULL DEFAULT 0,
    "bookmarks" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "supplement" TEXT,
    "imageUrls" TEXT,
    "progressionType" TEXT,
    "postType" TEXT,
    "algorithmEra" TEXT,
    "productName" TEXT,
    "buyPrice" REAL,
    "sellPrice" REAL,
    "sourceStore" TEXT,
    "priceDiffRatio" REAL,
    "franchiseId" TEXT,
    "isRewrite" BOOLEAN NOT NULL DEFAULT false,
    "originalPostId" TEXT,
    "rewriteNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "bookmarkRate" REAL,
    "isRewriteCandidate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "IpFranchise" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Post_originalPostId_fkey" FOREIGN KEY ("originalPostId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Phrase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "effect" TEXT,
    "bestResult" TEXT,
    "category" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PostPhrase" (
    "postId" TEXT NOT NULL,
    "phraseId" TEXT NOT NULL,

    PRIMARY KEY ("postId", "phraseId"),
    CONSTRAINT "PostPhrase_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostPhrase_phraseId_fkey" FOREIGN KEY ("phraseId") REFERENCES "Phrase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NgPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pattern" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suggestion" TEXT,
    "example" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PostTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "postType" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "IpFranchise_name_key" ON "IpFranchise"("name");

-- CreateIndex
CREATE UNIQUE INDEX "IpKeyword_keyword_key" ON "IpKeyword"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "Post_postUrl_key" ON "Post"("postUrl");

-- CreateIndex
CREATE INDEX "Post_postDate_idx" ON "Post"("postDate");

-- CreateIndex
CREATE INDEX "Post_impressions_idx" ON "Post"("impressions");

-- CreateIndex
CREATE INDEX "Post_franchiseId_idx" ON "Post"("franchiseId");

-- CreateIndex
CREATE INDEX "Post_algorithmEra_idx" ON "Post"("algorithmEra");

-- CreateIndex
CREATE INDEX "Post_status_idx" ON "Post"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Phrase_text_key" ON "Phrase"("text");
