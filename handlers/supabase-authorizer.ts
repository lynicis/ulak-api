import { APIGatewayAuthorizerHandler } from 'aws-lambda'
import { jwtVerify, createRemoteJWKSet } from 'jose'

const PROJECT_JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_AUTH_API_URL}/.well-known/jwks.json`)
);

const generatePolicy = (principalId: string, effect: 'Allow' | 'Deny', resource: string) => {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };
};

export const handler: APIGatewayAuthorizerHandler = async (event) => {
  try {
    if (event.type !== "TOKEN") {
      console.error('Unsupported authorization type:', event.type);
      return generatePolicy('anonymous', 'Deny', event.methodArn);
    }

    const token = event.authorizationToken?.replace('Bearer ', '');
    if (!token) {
      console.error('No authorization token provided');
      return generatePolicy('anonymous', 'Deny', event.methodArn);
    }

    const { payload } = await jwtVerify(token, PROJECT_JWKS, {
      audience: 'authenticated',
    });

    const userId = payload.sub;
    if (!userId) {
      console.error('Invalid token: no subject');
      return generatePolicy('anonymous', 'Deny', event.methodArn);
    }

    return generatePolicy(userId, 'Allow', event.methodArn);
  } catch (error) {
    console.error('Authorization failed:', error);
    return generatePolicy('anonymous', 'Deny', event.methodArn);
  }
}