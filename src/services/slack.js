import * as Linking from 'expo-linking';

const SLACK_WORKSPACE_URL = 'https://betternature.slack.com';
const SLACK_APP_SCHEME = 'slack://open';

export async function openSlack(channelId) {
  const slackUrl = channelId
    ? `slack://channel?team=YOUR_TEAM_ID&id=${channelId}`
    : SLACK_APP_SCHEME;

  const canOpen = await Linking.canOpenURL(slackUrl);

  if (canOpen) {
    await Linking.openURL(slackUrl);
  } else {
    // Fallback to web
    const webUrl = channelId
      ? `${SLACK_WORKSPACE_URL}/messages/${channelId}`
      : SLACK_WORKSPACE_URL;
    await Linking.openURL(webUrl);
  }
}
