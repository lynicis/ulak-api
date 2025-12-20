import {
    ContentFetcherStrategyFactory,
    ContentItem,
    PlatformKeys,
    SinceDate,
} from "../contentFetcherStrategies/contentStrategyFactory";
import { APIGatewayProxyHandler } from "aws-lambda";
import { Redis } from "@upstash/redis";
import { z } from "zod/v4-mini";

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const schema = z.object({
    platformName: z.enum(["MEDIUM", "X", "INSTAGRAM"]),
    username: z.string(),
});

export const handler: APIGatewayProxyHandler = async (event) => {
    const { success, error: validationError } = await schema.safeParseAsync(event.pathParameters);
    if (!success) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: validationError.message })
        };
    }

    const { platformName, username } = event.pathParameters as { platformName: PlatformKeys, username: string };
    const since = event.queryStringParameters?.since as SinceDate || "all";


    const cachedContents = await redis.get<{ contents: ContentItem[], fetchedAt: Date }>(
        `contents:${platformName}:${username}:${since}`
    );
    if (cachedContents) {
        const { contents, fetchedAt } = cachedContents;
        return {
            statusCode: 200,
            body: JSON.stringify({ contents, fetchedAt })
        };
    } 

    const fetchingStrategy = ContentFetcherStrategyFactory.getStrategy(platformName);
    const contents = await fetchingStrategy.fetchContent(username, since);

    const fetchedAt = new Date();
    await redis.set(
        `contents:${platformName}:${username}:${since}`,
        { contents, fetchedAt },
        { ex: 24 * 60 * 60 },
    ); 

    return {
        statusCode: 200,
        body: JSON.stringify({ contents, fetchedAt }),
    };
};