import { NextResponse } from "next/server";
import { cancelExpiredOrders, cleanupExpiredCardsIfNeeded, runLinuxDoUserIdMigrationBatch } from "@/lib/db/queries";

const CRON_TOKEN_HEADER = "x-cron-cleanup-token";
const CARD_CLEANUP_THROTTLE_MS = 60 * 1000;
const LINUXDO_MIGRATION_BATCH_SIZE = 8;
const LINUXDO_MIGRATION_MAX_LOOKUPS = 3;
const LINUXDO_MIGRATION_LOOKUP_TIMEOUT_MS = 2500;

function getCronToken(): string | null {
    const token = process.env.CRON_CLEANUP_TOKEN?.trim();
    if (token) return token;
    const oauthSecret = process.env.OAUTH_CLIENT_SECRET?.trim();
    return oauthSecret || null;
}

function isAuthorized(request: Request, expectedToken: string): boolean {
    const received = request.headers.get(CRON_TOKEN_HEADER)?.trim();
    return !!received && received === expectedToken;
}

export async function POST(request: Request) {
    const expectedToken = getCronToken();
    if (!expectedToken) {
        return NextResponse.json(
            { success: false, error: "cleanup_token_not_configured" },
            { status: 500 }
        );
    }

    if (!isAuthorized(request, expectedToken)) {
        return NextResponse.json(
            { success: false, error: "unauthorized" },
            { status: 401 }
        );
    }

    const startedAt = Date.now();
    const [cardsResult, ordersResult, migrationResult] = await Promise.allSettled([
        cleanupExpiredCardsIfNeeded(CARD_CLEANUP_THROTTLE_MS),
        cancelExpiredOrders(),
        runLinuxDoUserIdMigrationBatch({
            maxUsernames: LINUXDO_MIGRATION_BATCH_SIZE,
            maxLookups: LINUXDO_MIGRATION_MAX_LOOKUPS,
            lookupTimeoutMs: LINUXDO_MIGRATION_LOOKUP_TIMEOUT_MS,
        }),
    ]);

    const durationMs = Date.now() - startedAt;

    if (cardsResult.status === "rejected" || ordersResult.status === "rejected") {
        console.error("[cron-cleanup] failed", {
            cardsError: cardsResult.status === "rejected" ? String(cardsResult.reason) : null,
            ordersError: ordersResult.status === "rejected" ? String(ordersResult.reason) : null,
            migrationError: migrationResult.status === "rejected" ? String(migrationResult.reason) : null,
        });

        return NextResponse.json(
            { success: false, error: "cleanup_failed", durationMs },
            { status: 500 }
        );
    }

    if (migrationResult.status === "rejected") {
        console.error("[cron-cleanup] linuxdo migration failed", {
            error: String(migrationResult.reason),
        });
    }

    return NextResponse.json({
        success: true,
        durationMs,
        cardsCleanupRan: cardsResult.value,
        cancelledOrderCount: ordersResult.value.length,
        linuxDoMigration:
            migrationResult.status === "fulfilled"
                ? migrationResult.value
                : {
                    error: "linuxdo_migration_failed",
                },
    });
}
