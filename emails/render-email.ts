import { render } from "@react-email/components";
import NewsletterEmail from "./newsletter";

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

interface RenderNewsletterEmailParams {
  userEmail: string;
  followings: FollowingContent[];
}

export async function renderNewsletterEmail({
  userEmail,
  followings,
}: RenderNewsletterEmailParams): Promise<string> {
  const html = await render(
    NewsletterEmail({
      userEmail,
      followings,
    })
  );

  return html;
}
