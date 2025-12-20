import { trackBatchEmailAnalytics, EmailAnalytics } from "../utils/email-analytics";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { renderNewsletterEmail } from "../emails/render-email";
import { createClient } from "@supabase/supabase-js";
import { ScheduledEvent } from "aws-lambda";

const ses = new SESClient({ region: process.env.AWS_REGION });
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

type NewsletterPreferencesViewDTO = {
    newsletter_preference_id: string;
    profile_id: string;
    user_id: string;
    email: string;
    username: string;
    timezone: string;
    language: string;
    platform: "medium" | "instagram" | "x";
    followings: string[];
    newsletter_enabled: boolean;
    frequency: "daily" | "weekly" | "monthly";
    send_time: string;
}

function getCurrentHourInTimezone(timezone: string): number {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
    });
    return parseInt(formatter.format(now));
}

function getCurrentDayInTimezone(timezone: string): number {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
    });
    const dayName = formatter.format(now);
    const dayMap: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
    };
    return dayMap[dayName];
}

function getCurrentDayOfMonthInTimezone(timezone: string): number {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        day: "numeric",
    });
    return parseInt(formatter.format(now));
}

function shouldSendNewsletter(
    frequency: "daily" | "weekly" | "monthly",
    sendTime: string,
    timezone: string
): boolean {
    const [sendHour] = sendTime.split(":").map(Number);
    const currentHour = getCurrentHourInTimezone(timezone);

    if (currentHour !== sendHour) {
        return false;
    }

    if (frequency === "daily") {
        return true;
    }

    if (frequency === "weekly") {
        const currentDay = getCurrentDayInTimezone(timezone);
        return currentDay === 1;
    }

    if (frequency === "monthly") {
        const currentDayOfMonth = getCurrentDayOfMonthInTimezone(timezone);
        return currentDayOfMonth === 1;
    }

    return false;
}

async function getContentsByPlatformAndUsername(platform: string, username: string): Promise<any> {
    const requestUrl = new URL(`/contents/platforms/${platform}/users/${username}`, process.env.BASE_URL);
    requestUrl.searchParams.set("since", "today");

    const resp = await fetch(requestUrl);
    if (!resp.ok) {
        throw new Error("failed to get contents");
    }

    return resp.json();
}

const handler = async (_event: ScheduledEvent) => {
    const { data: newsletterPreferences, error: getNewsletterPreferencesError } = await supabase
        .from("newsletter_preferences_view")
        .select("*")
        .eq("newsletter_enabled", true)
        .overrideTypes<NewsletterPreferencesViewDTO[], { merge: false }>();

    if (getNewsletterPreferencesError) {
        console.error("Failed to fetch newsletter preferences:", getNewsletterPreferencesError);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to fetch newsletter preferences" }),
        };
    }

    if (!newsletterPreferences || newsletterPreferences.length === 0) {
        console.log("No newsletter preferences found");
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "No newsletters to send" }),
        };
    }

    const analyticsData: EmailAnalytics[] = [];

    const preferencesToSend = newsletterPreferences.filter((pref) => {
        const shouldSend = shouldSendNewsletter(pref.frequency, pref.send_time, pref.timezone);
        if (!shouldSend) {
            console.log(`Skipping newsletter for ${pref.email} (frequency: ${pref.frequency}, send_time: ${pref.send_time}, timezone: ${pref.timezone})`);
            analyticsData.push({
                email: pref.email,
                user_id: pref.user_id,
                status: "skipped",
                followings_count: 0,
                total_contents_count: 0,
                platforms: [pref.platform],
                frequency: pref.frequency,
                timezone: pref.timezone,
                send_time: pref.send_time,
                sent_at: new Date(),
            });
        }
        return shouldSend;
    });

    if (preferencesToSend.length === 0) {
        console.log("No newsletters scheduled for this hour");
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "No newsletters scheduled for this time" }),
        };
    }

    console.log(`Processing ${preferencesToSend.length} out of ${newsletterPreferences.length} newsletter preferences`);

    const groupedByUser = new Map<string, NewsletterPreferencesViewDTO[]>();
    for (const pref of preferencesToSend) {
        const existing = groupedByUser.get(pref.email) || [];
        existing.push(pref);
        groupedByUser.set(pref.email, existing);
    }

    console.log(`Grouped into ${groupedByUser.size} unique users`);

    const usersWithContents = await Promise.allSettled(
        Array.from(groupedByUser.entries()).map(async ([email, preferences]) => {
            const followingsResults = await Promise.allSettled(
                preferences.map(async (pref) => {
                    try {
                        const contents = await getContentsByPlatformAndUsername(pref.platform, pref.username);
                        return {
                            username: pref.username,
                            platform: pref.platform,
                            contents: contents || [],
                        };
                    } catch (error) {
                        console.error(`Failed to fetch contents for ${pref.username} on ${pref.platform}:`, error);
                        return {
                            username: pref.username,
                            platform: pref.platform,
                            contents: [],
                        };
                    }
                })
            );

            const followings = followingsResults
                .filter((result): result is PromiseFulfilledResult<{ username: string; platform: "medium" | "instagram" | "x"; contents: any[] }> =>
                    result.status === "fulfilled"
                )
                .map(result => result.value);

            return {
                email,
                followings,
            };
        })
    );

    const emailData = usersWithContents
        .filter((result): result is PromiseFulfilledResult<{ email: string; followings: any[] }> =>
            result.status === "fulfilled"
        )
        .map(result => result.value);

    if (emailData.length === 0) {
        console.log("No valid emails to send");
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "No valid newsletters to send" }),
        };
    }

    const sendResults = await Promise.allSettled(
        emailData.map(async ({ email, followings }) => {
            const startTime = Date.now();
            const userPreferences = Array.from(groupedByUser.get(email) || []);
            const userPref = userPreferences[0];

            try {
                const html = await renderNewsletterEmail({
                    userEmail: email,
                    followings,
                });

                const totalContents = followings.reduce((sum, f) => sum + f.contents.length, 0);
                const subject = totalContents > 0
                    ? `Your Content Digest: ${totalContents} new ${totalContents === 1 ? 'update' : 'updates'}`
                    : "Your Content Digest";

                const command = new SendEmailCommand({
                    Source: process.env.SES_FROM_EMAIL!,
                    Destination: {
                        ToAddresses: [email],
                    },
                    Message: {
                        Subject: {
                            Data: subject,
                            Charset: "UTF-8",
                        },
                        Body: {
                            Html: {
                                Data: html,
                                Charset: "UTF-8",
                            },
                        },
                    },
                });

                await ses.send(command);
                const processingTime = Date.now() - startTime;

                console.log(`Successfully sent email to ${email} with ${followings.length} followings (${totalContents} total contents)`);

                const platforms = [...new Set(followings.map(f => f.platform))];
                analyticsData.push({
                    email,
                    user_id: userPref?.user_id,
                    status: "sent",
                    followings_count: followings.length,
                    total_contents_count: totalContents,
                    platforms,
                    frequency: userPref?.frequency || "daily",
                    timezone: userPref?.timezone || "UTC",
                    send_time: userPref?.send_time || "00:00",
                    sent_at: new Date(),
                    processing_time_ms: processingTime,
                });

                return { email, success: true };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                const processingTime = Date.now() - startTime;

                console.error(`Failed to send email to ${email}:`, errorMessage);

                const platforms = [...new Set(followings.map(f => f.platform))];
                analyticsData.push({
                    email,
                    user_id: userPref?.user_id,
                    status: "failed",
                    error_message: errorMessage,
                    followings_count: followings.length,
                    total_contents_count: followings.reduce((sum, f) => sum + f.contents.length, 0),
                    platforms,
                    frequency: userPref?.frequency || "daily",
                    timezone: userPref?.timezone || "UTC",
                    send_time: userPref?.send_time || "00:00",
                    sent_at: new Date(),
                    processing_time_ms: processingTime,
                });

                return { email, success: false, error: errorMessage };
            }
        })
    );

    const errors: Array<{ email: string; error: string }> = [];
    let successCount = 0;

    sendResults.forEach((result) => {
        if (result.status === "fulfilled") {
            if (result.value.success) {
                successCount++;
            } else {
                errors.push({ email: result.value.email, error: result.value.error || "Unknown error" });
            }
        } else {
            errors.push({ email: "unknown", error: result.reason });
        }
    });

    const failureCount = errors.length;

    if (analyticsData.length > 0) {
        await trackBatchEmailAnalytics(analyticsData);
        console.log(`Tracked ${analyticsData.length} email analytics records`);
    }

    return {
        statusCode: errors.length > 0 ? 207 : 200,
        body: JSON.stringify({
            message: `Processed ${emailData.length} newsletters`,
            successCount,
            failureCount,
            errors: errors.length > 0 ? errors : undefined,
        }),
    };
};

export {
    handler,
};
