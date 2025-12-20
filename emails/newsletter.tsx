import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface ContentItem {
  title: string;
  url: string;
  publishedAt?: string;
  imageUrl?: string;
  description?: string;
}

interface FollowingContent {
  username: string;
  platform: "medium" | "instagram" | "x";
  contents: ContentItem[];
}

interface NewsletterEmailProps {
  userEmail: string;
  followings: FollowingContent[];
}

export const NewsletterEmail = ({
  userEmail: _userEmail = "user@example.com",
  followings = [],
}: NewsletterEmailProps) => {
  const totalContents = followings.reduce((sum, f) => sum + f.contents.length, 0);
  const previewText = totalContents > 0
    ? `${totalContents} new ${totalContents === 1 ? 'update' : 'updates'} from your followings`
    : "No new content from your followings";

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Your Content Digest</Heading>
          <Text style={subtitle}>
            {totalContents > 0
              ? `${totalContents} new ${totalContents === 1 ? 'update' : 'updates'} from ${followings.length} ${followings.length === 1 ? 'creator' : 'creators'}`
              : "No new content at this time"}
          </Text>

          {followings.length === 0 ? (
            <Section style={section}>
              <Text style={text}>
                No new content available from your followings at this time.
              </Text>
            </Section>
          ) : (
            followings.map((following, followingIndex) => {
              const platformName = following.platform.charAt(0).toUpperCase() + following.platform.slice(1);

              return (
                <Section key={followingIndex} style={followingSection}>
                  <Heading as="h2" style={h2}>
                    {following.username} on {platformName}
                  </Heading>

                  {following.contents.length === 0 ? (
                    <Text style={noContentText}>No new content</Text>
                  ) : (
                    following.contents.map((content, contentIndex) => (
                      <Section key={contentIndex} style={contentSection}>
                        {content.imageUrl && (
                          <Img
                            src={content.imageUrl}
                            alt={content.title}
                            style={contentImage}
                          />
                        )}
                        <Heading as="h3" style={h3}>
                          <Link href={content.url} style={link}>
                            {content.title}
                          </Link>
                        </Heading>
                        {content.description && (
                          <Text style={description}>{content.description}</Text>
                        )}
                        {content.publishedAt && (
                          <Text style={publishedDate}>
                            Published: {new Date(content.publishedAt).toLocaleDateString()}
                          </Text>
                        )}
                        {contentIndex < following.contents.length - 1 && <Hr style={contentHr} />}
                      </Section>
                    ))
                  )}

                  {followingIndex < followings.length - 1 && <Hr style={hr} />}
                </Section>
              );
            })
          )}

          <Hr style={hr} />

          <Text style={footer}>
            You're receiving this email because you subscribed to content updates.
            <br />
            <Link href={`${process.env.WEBSITE_URL}/profile`} style={unsubscribeLink}>
              Unsubscribe from emails
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default NewsletterEmail;

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "600px",
};

const h1 = {
  color: "#1a1a1a",
  fontSize: "28px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "16px 0",
};

const subtitle = {
  color: "#666",
  fontSize: "16px",
  lineHeight: "1.5",
  margin: "0 0 24px",
};

const h2 = {
  color: "#1a1a1a",
  fontSize: "22px",
  fontWeight: "600",
  lineHeight: "1.4",
  margin: "0 0 16px",
  borderBottom: "2px solid #e6e6e6",
  paddingBottom: "8px",
};

const h3 = {
  color: "#1a1a1a",
  fontSize: "18px",
  fontWeight: "600",
  lineHeight: "1.4",
  margin: "12px 0 8px",
};

const text = {
  color: "#444",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "16px 0",
};

const noContentText = {
  color: "#999",
  fontSize: "14px",
  fontStyle: "italic",
  margin: "8px 0",
};

const description = {
  color: "#666",
  fontSize: "15px",
  lineHeight: "1.5",
  margin: "8px 0",
};

const publishedDate = {
  color: "#999",
  fontSize: "14px",
  margin: "4px 0",
};

const link = {
  color: "#0066cc",
  textDecoration: "none",
};

const section = {
  padding: "24px 0",
};

const followingSection = {
  padding: "20px 0",
};

const contentSection = {
  padding: "12px 0",
};

const contentImage = {
  width: "100%",
  maxWidth: "600px",
  height: "auto",
  borderRadius: "8px",
  marginBottom: "16px",
};

const hr = {
  borderColor: "#cccccc",
  margin: "24px 0",
};

const contentHr = {
  borderColor: "#e6e6e6",
  margin: "16px 0",
};

const footer = {
  color: "#999",
  fontSize: "12px",
  lineHeight: "1.5",
  marginTop: "32px",
};

const unsubscribeLink = {
  color: "#0066cc",
  textDecoration: "underline",
};