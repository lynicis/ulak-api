import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

export type EmailAnalytics = {
    id?: string;
    email: string;
    user_id?: string;
    status: "sent" | "failed" | "skipped";
    error_message?: string;
    followings_count: number;
    total_contents_count: number;
    platforms: string[];
    frequency: "daily" | "weekly" | "monthly";
    timezone: string;
    send_time: string;
    sent_at: Date;
    processing_time_ms?: number;
};

export async function trackEmailAnalytics(analytics: EmailAnalytics): Promise<void> {
    try {
        const { error } = await supabase
            .from("email_analytics")
            .insert({
                email: analytics.email,
                user_id: analytics.user_id,
                status: analytics.status,
                error_message: analytics.error_message,
                followings_count: analytics.followings_count,
                total_contents_count: analytics.total_contents_count,
                platforms: analytics.platforms,
                frequency: analytics.frequency,
                timezone: analytics.timezone,
                send_time: analytics.send_time,
                sent_at: analytics.sent_at.toISOString(),
                processing_time_ms: analytics.processing_time_ms,
            });

        if (error) {
            console.error("Failed to track email analytics:", error);
        }
    } catch (error) {
        console.error("Error tracking email analytics:", error);
    }
}

export async function trackBatchEmailAnalytics(
    analyticsBatch: EmailAnalytics[]
): Promise<void> {
    try {
        const { error } = await supabase
            .from("email_analytics")
            .insert(
                analyticsBatch.map((analytics) => ({
                    email: analytics.email,
                    user_id: analytics.user_id,
                    status: analytics.status,
                    error_message: analytics.error_message,
                    followings_count: analytics.followings_count,
                    total_contents_count: analytics.total_contents_count,
                    platforms: analytics.platforms,
                    frequency: analytics.frequency,
                    timezone: analytics.timezone,
                    send_time: analytics.send_time,
                    sent_at: analytics.sent_at.toISOString(),
                    processing_time_ms: analytics.processing_time_ms,
                }))
            );

        if (error) {
            console.error("Failed to track batch email analytics:", error);
        }
    } catch (error) {
        console.error("Error tracking batch email analytics:", error);
    }
}

export type EmailAnalyticsStats = {
    total_emails_sent: number;
    total_emails_failed: number;
    total_emails_skipped: number;
    success_rate: number;
    average_contents_per_email: number;
    average_processing_time_ms: number;
    breakdown_by_frequency: {
        daily: { sent: number; failed: number; skipped: number };
        weekly: { sent: number; failed: number; skipped: number };
        monthly: { sent: number; failed: number; skipped: number };
    };
    breakdown_by_platform: Record<string, { sent: number; failed: number }>;
};

export async function getEmailAnalyticsStats(
    startDate: Date,
    endDate: Date
): Promise<EmailAnalyticsStats | null> {
    try {
        const { data, error } = await supabase
            .from("email_analytics")
            .select("*")
            .gte("sent_at", startDate.toISOString())
            .lte("sent_at", endDate.toISOString());

        if (error) {
            console.error("Failed to fetch email analytics stats:", error);
            return null;
        }

        if (!data || data.length === 0) {
            return {
                total_emails_sent: 0,
                total_emails_failed: 0,
                total_emails_skipped: 0,
                success_rate: 0,
                average_contents_per_email: 0,
                average_processing_time_ms: 0,
                breakdown_by_frequency: {
                    daily: { sent: 0, failed: 0, skipped: 0 },
                    weekly: { sent: 0, failed: 0, skipped: 0 },
                    monthly: { sent: 0, failed: 0, skipped: 0 },
                },
                breakdown_by_platform: {},
            };
        }

        const totalSent = data.filter((d) => d.status === "sent").length;
        const totalFailed = data.filter((d) => d.status === "failed").length;
        const totalSkipped = data.filter((d) => d.status === "skipped").length;

        const successRate = totalSent + totalFailed > 0
            ? (totalSent / (totalSent + totalFailed)) * 100
            : 0;

        const sentEmails = data.filter((d) => d.status === "sent");
        const averageContents = sentEmails.length > 0
            ? sentEmails.reduce((sum, d) => sum + (d.total_contents_count || 0), 0) / sentEmails.length
            : 0;

        const emailsWithProcessingTime = data.filter((d) => d.processing_time_ms !== null);
        const averageProcessingTime = emailsWithProcessingTime.length > 0
            ? emailsWithProcessingTime.reduce((sum, d) => sum + (d.processing_time_ms || 0), 0) / emailsWithProcessingTime.length
            : 0;

        const breakdownByFrequency = {
            daily: {
                sent: data.filter((d) => d.frequency === "daily" && d.status === "sent").length,
                failed: data.filter((d) => d.frequency === "daily" && d.status === "failed").length,
                skipped: data.filter((d) => d.frequency === "daily" && d.status === "skipped").length,
            },
            weekly: {
                sent: data.filter((d) => d.frequency === "weekly" && d.status === "sent").length,
                failed: data.filter((d) => d.frequency === "weekly" && d.status === "failed").length,
                skipped: data.filter((d) => d.frequency === "weekly" && d.status === "skipped").length,
            },
            monthly: {
                sent: data.filter((d) => d.frequency === "monthly" && d.status === "sent").length,
                failed: data.filter((d) => d.frequency === "monthly" && d.status === "failed").length,
                skipped: data.filter((d) => d.frequency === "monthly" && d.status === "skipped").length,
            },
        };

        const platformSet = new Set<string>();
        data.forEach((d) => {
            if (d.platforms && Array.isArray(d.platforms)) {
                d.platforms.forEach((p: string) => platformSet.add(p));
            }
        });

        const breakdownByPlatform: Record<string, { sent: number; failed: number }> = {};
        platformSet.forEach((platform) => {
            breakdownByPlatform[platform] = {
                sent: data.filter((d) =>
                    d.platforms &&
                    Array.isArray(d.platforms) &&
                    d.platforms.includes(platform) &&
                    d.status === "sent"
                ).length,
                failed: data.filter((d) =>
                    d.platforms &&
                    Array.isArray(d.platforms) &&
                    d.platforms.includes(platform) &&
                    d.status === "failed"
                ).length,
            };
        });

        return {
            total_emails_sent: totalSent,
            total_emails_failed: totalFailed,
            total_emails_skipped: totalSkipped,
            success_rate: Math.round(successRate * 100) / 100,
            average_contents_per_email: Math.round(averageContents * 100) / 100,
            average_processing_time_ms: Math.round(averageProcessingTime * 100) / 100,
            breakdown_by_frequency: breakdownByFrequency,
            breakdown_by_platform: breakdownByPlatform,
        };
    } catch (error) {
        console.error("Error fetching email analytics stats:", error);
        return null;
    }
}
