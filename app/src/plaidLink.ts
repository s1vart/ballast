import {
  createPlaidLinkSession,
  LinkSuccess,
  LinkExit,
} from 'react-native-plaid-link-sdk';
import { getLinkToken, exchangePublicToken } from './api';
import { CLIENT_USER_ID } from './config';

/**
 * Opens Plaid Link (SDK v13 session API), then exchanges the resulting
 * public_token on the backend.
 *
 * ⚠️ Uses a native module — this will NOT run in Expo Go. You need a
 * development build (see README: `npx expo prebuild` + `npx expo run:android`).
 */
export async function connectBank(): Promise<{ item_id: string; institution: string | null }> {
  const linkToken = await getLinkToken(CLIENT_USER_ID);

  return new Promise((resolve, reject) => {
    createPlaidLinkSession({
      token: linkToken,
      onSuccess: (success: LinkSuccess) => {
        // success.publicToken is short-lived; exchange it server-side immediately.
        exchangePublicToken(success.publicToken).then(resolve).catch(reject);
      },
      onExit: (exit: LinkExit) => {
        if (exit.error) {
          reject(new Error(exit.error.displayMessage ?? exit.error.errorMessage ?? 'Link error'));
        } else {
          reject(new Error('cancelled'));
        }
      },
      onEvent: () => {
        // required by the SDK; useful for analytics, not needed here
      },
    })
      .then((session) => session.open())
      .catch(reject);
  });
}
