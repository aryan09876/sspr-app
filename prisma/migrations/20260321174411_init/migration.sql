-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "adDn" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "verifiedAt" DATETIME,
    "consumedAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");
