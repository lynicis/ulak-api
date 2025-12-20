import { getEmailAnalyticsStats } from "../utils/email-analytics";
import { APIGatewayProxyHandler } from "aws-lambda";
import { z } from "zod";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": process.env.WEBSITE_URL || "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
};

const querySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    period: z.enum(["today", "yesterday", "last_7_days", "last_30_days", "last_90_days", "all_time"]).optional(),
});

function getPeriodDates(period: string): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = new Date();
    let startDate = new Date();

    switch (period) {
        case "today":
            startDate.setHours(0, 0, 0, 0);
            break;
        case "yesterday":
            startDate.setDate(now.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setDate(now.getDate() - 1);
            endDate.setHours(23, 59, 59, 999);
            break;
        case "last_7_days":
            startDate.setDate(now.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
            break;
        case "last_30_days":
            startDate.setDate(now.getDate() - 30);
            startDate.setHours(0, 0, 0, 0);
            break;
        case "last_90_days":
            startDate.setDate(now.getDate() - 90);
            startDate.setHours(0, 0, 0, 0);
            break;
        case "all_time":
            startDate = new Date(0);
            break;
        default:
            startDate.setDate(now.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
    }

    return { startDate, endDate };
}

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const queryParams = querySchema.parse(event.queryStringParameters || {});

        let startDate: Date;
        let endDate: Date;

        if (queryParams.startDate && queryParams.endDate) {
            startDate = new Date(queryParams.startDate);
            endDate = new Date(queryParams.endDate);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: "Invalid date format. Use ISO 8601 format." }),
                };
            }
        } else {
            const dates = getPeriodDates(queryParams.period || "last_7_days");
            startDate = dates.startDate;
            endDate = dates.endDate;
        }

        const stats = await getEmailAnalyticsStats(startDate, endDate);

        if (!stats) {
            return {
                statusCode: 500,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: "Failed to retrieve analytics stats" }),
            };
        }

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                period: {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                },
                stats,
            }),
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    error: "Invalid query parameters",
                    details: error.issues,
                }),
            };
        }

        console.error("Error fetching email analytics:", error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }
};
