import {
  FollowingFetcherStrategyFactory,
  CachedFollowingsDTO,
  FollowingUser,
} from "../followingFetcherStrategies/followingFetcherFactory";
import { APIGatewayProxyHandler } from "aws-lambda";
import { Redis } from "@upstash/redis";
import { Search } from "@upstash/search";
import { z } from "zod/v4-mini";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const searchClient = new Search({
  url: process.env.UPSTASH_SEARCH_REST_URL!,
  token: process.env.UPSTASH_SEARCH_REST_TOKEN!,
});

type FollowingDocument = {
  fullName: string;
  username: string;
  profileUrl: string;
  profilePictureUrl?: string;
  platformName: string;
  parentUsername: string;
};

const index = searchClient.index<FollowingDocument>("followings");

const schema = z.object({
  platformName: z.enum(["MEDIUM", "X", "INSTAGRAM"]),
  username: z.string(),
});

const FOLLOWINGS_KEY_PREFIX = `followings:`;

const storeFollowingsForSearch = async (
  platformName: string,
  username: string,
  followings: FollowingUser[],
) => {
  const documents = followings.map((following) => ({
    id: `${platformName}:${username}:${following.username}`,
    content: {
      fullName: following.fullName,
      username: following.username,
      profileUrl: following.profileUrl,
      profilePictureUrl: following.profilePictureUrl || "",
      platformName,
      parentUsername: username,
    },
  }));

  await index.upsert(documents);
};

const searchFollowings = async (
  platformName: string,
  username: string,
  searchQuery: string,
): Promise<FollowingUser[]> => {
    const results = await index.search({
      query: searchQuery,
      filter: {
        AND: [
          { platformName: { equals: platformName } },
          { parentUsername: { equals: username } },
        ],
      },
      limit: 1000,
    });

  return results.map((doc) => ({
      fullName: doc.content.fullName,
      username: doc.content.username,
      profileUrl: doc.content.profileUrl,
      profilePictureUrl: doc.content.profilePictureUrl || undefined,
  }));
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const { success, error: validationError } = await schema.safeParseAsync(event.pathParameters);
  if (!success) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: validationError.message })
    };
  }

  const { platformName, username } = event.pathParameters as { platformName: string, username: string };
  const searchQuery = event.queryStringParameters?.search?.trim();

  const fetchingStrategy = FollowingFetcherStrategyFactory.getStrategy(platformName);
  
  const isUserExists = await fetchingStrategy.isUserExists(username);
  if (!isUserExists) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "user not found" }),
    }
  }

  if (searchQuery) {
    const cachedFollowings = await redis.get<CachedFollowingsDTO>(`${FOLLOWINGS_KEY_PREFIX}${platformName}:${username}`);
    
    if (cachedFollowings) {
      const searchResults = await searchFollowings(platformName, username, searchQuery);
      if (searchResults.length > 0 || cachedFollowings.fetchedAt) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            followings: searchResults,
            fetchedAt: cachedFollowings.fetchedAt,
          }),
        };
      }
    }
    
    try {
      const followings = await fetchingStrategy.getFollowings(username);
      const fetchedAt = new Date();
      
      await redis.set<CachedFollowingsDTO>(
        `${FOLLOWINGS_KEY_PREFIX}${platformName}:${username}`,
        { followings, fetchedAt },
        { ex: 24 * 60 * 60 },
      );
      
      await storeFollowingsForSearch(platformName, username, followings);
      
      const searchResults = await searchFollowings(platformName, username, searchQuery);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          followings: searchResults,
          fetchedAt,
        }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "internal_error",
          message: err instanceof Error ? err.message : "Unknown error",
        }),
      };
    }
  }

  const cachedFollowings = await redis.get<CachedFollowingsDTO>(`${FOLLOWINGS_KEY_PREFIX}${platformName}:${username}`);
  if (cachedFollowings) {
    const { followings, fetchedAt } = cachedFollowings;
    return {
      statusCode: 200,
      body: JSON.stringify({
        followings,
        fetchedAt,
      }),
    };
  }

  try { 
    const followings = await fetchingStrategy.getFollowings(username);

    const fetchedAt = new Date();
    await redis.set<CachedFollowingsDTO>(
      `${FOLLOWINGS_KEY_PREFIX}${platformName}:${username}`,
      { followings, fetchedAt },
      { ex: 24 * 60 * 60 },
    );

    await storeFollowingsForSearch(platformName, username, followings);

    return {
      statusCode: 200,
      body: JSON.stringify({
        followings,
        fetchedAt,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "internal_error",
        message: err instanceof Error ? err.message : "Unknown error",
      }),
    };
  }
};
